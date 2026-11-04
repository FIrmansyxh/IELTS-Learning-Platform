'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { coerceStored, initialResponse, isAiQuestion, isAnswerReady } from '@/components/quiz/answer-utils';
import { ExamShell, type ExamShellLabels } from '@/components/quiz/exam-shell';
import { QuestionNavigatorGrid } from '@/components/quiz/question-navigator-grid';
import { QuestionRenderer } from '@/components/quiz/question-renderer';
import { parseAttemptPassages } from '@/components/reading/parse-attempt';
import { GroupedExamBody, GroupedFooter, isGroupedAttempt } from './grouped-exam';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnswerResponse, Attempt } from '@/contracts/attempts';
import { fmt, id } from '@/i18n/id';
import { attemptsApi } from '@/lib/api/attempts';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import type { SubmitSectionData } from '@/lib/api/boss-contract';
import { loadFlags, saveFlags } from '@/lib/reading/storage';
import { BossRunner } from './boss/boss-runner';
import { PlacementSession } from './placement/placement-session';

const SAVE_DEBOUNCE_MS = 400;

type SaveState = 'idle' | 'saving' | 'saved';
type SaveResult = 'ok' | 'failed' | 'ended';
/** Jeda sebelum pengiriman otomatis dicoba lagi setelah gagal (waktu habis). */
const AUTO_RETRY_MS = 3000;
const SUBMIT_FAIL_TOAST = 'exam-submit-failed';
/** Backoff simpan jawaban gagal (SPEC-010): 2, 4, 8 detik, maks 3 kali, lalu Toast "Coba lagi". */
const SAVE_RETRY_MS = [2000, 4000, 8000];
/** Sinkronisasi sisa waktu dengan server (koreksi drift) tiap 60 detik. */
const SYNC_INTERVAL_MS = 60_000;

/** Kode galat yang berarti attempt/section sudah ditutup server (waktu habis atau tidak aktif). */
function isEndedError(e: unknown): boolean {
  return (
    isApiError(e) &&
    (e.code === 'ATTEMPT_EXPIRED' || e.code === 'ATTEMPT_NOT_ACTIVE' || e.code === 'SECTION_EXPIRED' || e.code === 'SECTION_NOT_ACTIVE')
  );
}

/**
 * Pengikat section Boss Stage (SPEC-014). Dengan pengikat ini `ExamSession` mengerjakan SATU section: "selesai"
 * memanggil submit section (bukan submit attempt), dan penutupan oleh server diserahkan ke `onClosed`.
 */
export type ExamSectionBinding = {
  submit: () => Promise<SubmitSectionData>;
  onSubmitted: (data: SubmitSectionData, timedOut: boolean) => void;
  onClosed: () => void;
};

const SECTION_LABELS: ExamShellLabels = {
  end: id.boss.run.finishSection,
  endTitle: id.boss.run.endTitle,
  endBody: id.boss.run.endBody,
  endConfirm: id.boss.run.endConfirm,
};

/**
 * Sesi ujian berjalan (mode EXAM): tanpa umpan balik/kunci, jawaban boleh diganti sampai submit,
 * timer dihitung dari `deadline_at` server (selisih jam server disesuaikan sekali saat dimuat).
 */
export function ExamSession({ attempt, section }: { attempt: Attempt; section?: ExamSectionBinding }) {
  const router = useRouter();
  const sectionRef = React.useRef(section);
  sectionRef.current = section;
  const questions = attempt.questions;
  const total = questions.length;
  const [index, setIndex] = React.useState(() => Math.min(attempt.current_index, Math.max(0, total - 1)));
  const [responses, setResponses] = React.useState<Record<string, AnswerResponse | null>>(() => {
    const m: Record<string, AnswerResponse | null> = {};
    for (const q of questions) m[q.question_id] = initialResponse(q);
    for (const a of attempt.answers) m[a.question_id] = coerceStored(a.response);
    return m;
  });
  const [saved, setSaved] = React.useState<Set<string>>(() => new Set(attempt.answers.map((a) => a.question_id)));
  const grouped = isGroupedAttempt(attempt);
  const parsed = React.useMemo(() => parseAttemptPassages(attempt.passage_markdown), [attempt.passage_markdown]);
  const [flagged, setFlagged] = React.useState<Set<string>>(() => {
    if (!grouped) return new Set();
    const valid = new Set(attempt.questions.map((x) => x.question_id));
    return new Set(loadFlags(attempt.id).filter((x) => valid.has(x)));
  });
  const [unsaved, setUnsaved] = React.useState<Set<string>>(() => new Set());
  const [focusRequest, setFocusRequest] = React.useState(0);
  const retryTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const retryCount = React.useRef(new Map<string, number>());
  const flagsFirst = React.useRef(true);
  React.useEffect(() => {
    if (flagsFirst.current) {
      flagsFirst.current = false;
      return;
    }
    if (grouped) saveFlags(attempt.id, flagged);
  }, [flagged, grouped, attempt.id]);
  const [saveState, setSaveState] = React.useState<SaveState>('idle');
  const [submitting, setSubmitting] = React.useState(false);
  const legendRef = React.useRef<HTMLLegendElement | null>(null);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = React.useRef(responses);
  latest.current = responses;
  const submittingRef = React.useRef(false);
  /** Soal yang simpan jawabannya gagal; dicoba lagi sebelum submit. */
  const failedSaves = React.useRef(new Set<string>());
  const allowLeave = React.useRef(false);
  const nextAutoAt = React.useRef(0);

  /* ---------- timer berdasarkan deadline server ---------- */
  const skew = React.useRef(Date.parse(attempt.server_now) - Date.now());
  const deadline = attempt.deadline_at ? Date.parse(attempt.deadline_at) : null;
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - (now + skew.current)) / 1000));
  const remainingRef = React.useRef(remaining);
  remainingRef.current = remaining;

  /** Attempt selesai/ditutup server: ke hasil; pada section Boss diserahkan ke pengikat section. */
  const goResult = React.useCallback(() => {
    const sec = sectionRef.current;
    if (sec) sec.onClosed();
    else router.replace(`/ujian/${attempt.id}/hasil`);
  }, [router, attempt.id]);

  /** Rantai PUT per soal: satu permintaan aktif per `question_id`, nilai terbaru menang (F-10-07). */
  const saveChain = React.useRef(new Map<string, Promise<unknown>>());
  const saveOnceRef = React.useRef<(qid: string, opts: { retry?: boolean }) => Promise<SaveResult>>(async () => 'ok');
  const saveNow = React.useCallback(
    (qid: string, opts: { retry?: boolean } = {}): Promise<SaveResult> => {
      const prev = saveChain.current.get(qid) ?? Promise.resolve();
      const run = prev.then(() => saveOnceRef.current(qid, opts));
      const tail = run.catch(() => undefined);
      saveChain.current.set(qid, tail);
      void tail.then(() => {
        if (saveChain.current.get(qid) === tail) saveChain.current.delete(qid);
      });
      return run;
    },
    [],
  );
  const saveOnce = React.useCallback(
    async (qid: string, opts: { retry?: boolean } = {}): Promise<SaveResult> => {
      const resp = latest.current[qid];
      const q = questions.find((x) => x.question_id === qid);
      if (!resp || !q || !isAnswerReady(q, resp)) return 'ok';
      setSaveState('saving');
      try {
        await attemptsApi.answer(attempt.id, qid, resp);
        failedSaves.current.delete(qid);
        retryCount.current.delete(qid);
        setUnsaved((s) => {
          if (!s.has(qid)) return s;
          const n = new Set(s);
          n.delete(qid);
          return n;
        });
        setSaved((s) => new Set(s).add(qid));
        setSaveState('saved');
        return 'ok';
      } catch (e) {
        setSaveState('idle');
        if (isEndedError(e)) {
          allowLeave.current = true;
          goResult();
          return 'ended';
        }
        failedSaves.current.add(qid);
        setUnsaved((s) => new Set(s).add(qid));
        const tries = retryCount.current.get(qid) ?? 0;
        if (opts.retry && tries < SAVE_RETRY_MS.length) {
          retryCount.current.set(qid, tries + 1);
          const prev = retryTimers.current.get(qid);
          if (prev) clearTimeout(prev);
          retryTimers.current.set(
            qid,
            setTimeout(() => {
              retryTimers.current.delete(qid);
              void saveNow(qid, { retry: true });
            }, SAVE_RETRY_MS[tries]),
          );
          return 'failed';
        }
        retryCount.current.delete(qid);
        toast.error(id.quiz.answerNotSaved, {
          duration: Infinity,
          action: {
            label: id.common.retry,
            onClick: () => {
              retryCount.current.delete(qid);
              void saveNow(qid, { retry: true });
            },
          },
        });
        return 'failed';
      }
    },
    [attempt.id, questions, goResult, saveNow],
  );
  saveOnceRef.current = saveOnce;

  /** Simpan semua jawaban tertunda dan yang sebelumnya gagal. 'failed' = ada yang belum tersimpan. */
  const flushPending = React.useCallback(async (): Promise<SaveResult> => {
    const pending = new Set<string>([...timers.current.keys(), ...failedSaves.current]);
    for (const qid of timers.current.keys()) {
      clearTimeout(timers.current.get(qid));
      timers.current.delete(qid);
    }
    for (const t of retryTimers.current.values()) clearTimeout(t);
    retryTimers.current.clear();
    const results = await Promise.all([...pending].map((qid) => saveNow(qid)));
    if (results.includes('ended')) return 'ended';
    return results.includes('failed') ? 'failed' : 'ok';
  }, [saveNow]);

  const finish = React.useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    const flushed = await flushPending();
    if (flushed === 'ended') return;
    if (flushed === 'failed') {
      // Jangan kirim: jawaban terakhir belum tersimpan di server.
      nextAutoAt.current = Date.now() + AUTO_RETRY_MS;
      submittingRef.current = false;
      setSubmitting(false);
      toast.error(id.exam.run.saveFailedBeforeSubmit, { id: SUBMIT_FAIL_TOAST });
      return;
    }
    try {
      const sec = sectionRef.current;
      if (sec) {
        const data = await sec.submit();
        toast.dismiss(SUBMIT_FAIL_TOAST);
        allowLeave.current = true;
        sec.onSubmitted(data, remainingRef.current === 0);
        return;
      }
      await attemptsApi.submit(attempt.id);
      toast.dismiss(SUBMIT_FAIL_TOAST);
      allowLeave.current = true;
      goResult();
    } catch (e) {
      if (isEndedError(e)) {
        allowLeave.current = true;
        goResult();
        return;
      }
      nextAutoAt.current = Date.now() + AUTO_RETRY_MS;
      submittingRef.current = false;
      setSubmitting(false);
      toast.error(apiErrorMessage(e), { id: SUBMIT_FAIL_TOAST });
    }
  }, [flushPending, attempt.id, goResult]);

  // Peringatan beforeunload selama ujian berjalan (hilang setelah submit/akhir sesi).
  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowLeave.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Waktu habis: kirim otomatis; bila gagal, coba lagi tiap AUTO_RETRY_MS sampai berhasil atau server menutup attempt.
  React.useEffect(() => {
    if (remaining === 0 && !submittingRef.current && Date.now() >= nextAutoAt.current) {
      void finish();
    }
  }, [remaining, now, finish]);

  React.useEffect(() => {
    const map = timers.current;
    const retries = retryTimers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      for (const t of retries.values()) clearTimeout(t);
    };
  }, []);

  // Koreksi drift: tiap 60 detik ambil ulang attempt hanya untuk jam server (jawaban lokal tidak diubah).
  const goResultRef = React.useRef(goResult);
  goResultRef.current = goResult;
  React.useEffect(() => {
    const t = setInterval(() => {
      attemptsApi
        .get(attempt.id)
        .then((fresh) => {
          skew.current = Date.parse(fresh.server_now) - Date.now();
          if (fresh.status !== 'IN_PROGRESS') {
            allowLeave.current = true;
            goResultRef.current();
          }
        })
        .catch(() => undefined);
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(t);
  }, [attempt.id]);

  const q = questions[index];
  React.useEffect(() => {
    if (!grouped) legendRef.current?.focus();
  }, [index, grouped]);
  if (!q) return null;

  const changeAnswer = (qid: string, next: AnswerResponse | null) => {
    setResponses((m) => ({ ...m, [qid]: next }));
    latest.current = { ...latest.current, [qid]: next };
    const old = timers.current.get(qid);
    if (old) clearTimeout(old);
    const oldRetry = retryTimers.current.get(qid);
    if (oldRetry) clearTimeout(oldRetry);
    retryTimers.current.delete(qid);
    retryCount.current.delete(qid);
    timers.current.set(
      qid,
      setTimeout(() => {
        timers.current.delete(qid);
        void saveNow(qid, { retry: true });
      }, SAVE_DEBOUNCE_MS),
    );
  };
  const onChange = (next: AnswerResponse | null) => changeAnswer(q.question_id, next);

  const isDone = (qid: string, qq: (typeof questions)[number]) =>
    !isAiQuestion(qq) && (saved.has(qid) || isAnswerReady(qq, responses[qid] ?? null));
  const items = questions.map((qq) => ({
    questionId: qq.question_id,
    answered: isDone(qq.question_id, qq),
    flagged: flagged.has(qq.question_id),
    unsaved: unsaved.has(qq.question_id),
  }));
  const answeredCount = items.filter((i) => i.answered).length;

  const goTo = async (i: number) => {
    // Simpan jawaban soal saat ini sebelum berpindah.
    const t = timers.current.get(q.question_id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(q.question_id);
      void saveNow(q.question_id);
    }
    setIndex(Math.max(0, Math.min(total - 1, i)));
  };

  const navigate = (i: number) => {
    void goTo(i);
    setFocusRequest((n) => n + 1);
  };
  const toggleFlag = (qid: string) =>
    setFlagged((s) => {
      const n = new Set(s);
      if (n.has(qid)) n.delete(qid);
      else n.add(qid);
      return n;
    });
  const saveStatusText = saveState === 'saving' ? id.exam.run.saving : saveState === 'saved' ? id.exam.run.saved : '';

  if (grouped) {
    return (
      <ExamShell
        title={attempt.title}
        remainingSeconds={remaining}
        unansweredCount={total - answeredCount}
        onEnd={() => void finish()}
        labels={section ? SECTION_LABELS : undefined}
        layout={attempt.passage_markdown !== null ? 'workspace' : 'page'}
        footer={(openEnd) => (
          <GroupedFooter
            index={index}
            total={total}
            items={items}
            answeredCount={answeredCount}
            submitting={submitting}
            statusText={saveStatusText}
            navigate={navigate}
            openEnd={openEnd}
            submitLabel={section ? id.boss.run.finishSection : undefined}
          />
        )}
      >
        <GroupedExamBody
          attempt={attempt}
          passages={parsed.passages}
          passageError={parsed.error}
          index={index}
          responses={responses}
          onChange={changeAnswer}
          disabled={submitting}
          flagged={flagged}
          onToggleFlag={toggleFlag}
          unsaved={unsaved}
          onFocusQuestion={(qid) => {
            const i = questions.findIndex((x) => x.question_id === qid);
            if (i >= 0) setIndex(i);
          }}
          onSelectGroup={(i) => void goTo(i)}
          focusRequest={focusRequest}
        />
      </ExamShell>
    );
  }

  const isFlagged = flagged.has(q.question_id);
  return (
    <ExamShell
      title={attempt.title}
      remainingSeconds={remaining}
      unansweredCount={total - answeredCount}
      onEnd={() => void finish()}
      labels={section ? SECTION_LABELS : undefined}
      navigator={
        <details className="rounded-lg border bg-card p-3 md:open:block">
          <summary className="min-h-11 cursor-pointer list-none text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {id.quiz.exam.openNavigator} · {fmt(id.exam.run.answeredCount, { n: answeredCount, total })}
          </summary>
          <div className="pt-3">
            <QuestionNavigatorGrid items={items} currentIndex={index} onSelect={(i) => void goTo(i)} />
          </div>
        </details>
      }
    >
      <section className="grid gap-4" aria-label={fmt(id.exam.run.questionOf, { n: index + 1, total })}>
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="font-semibold" data-testid="question-counter">
            {fmt(id.exam.run.questionOf, { n: index + 1, total })}
          </p>
          <p role="status" aria-live="polite" className="text-muted-foreground">
            {saveStatusText}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 sm:p-6">
          <QuestionRenderer
            key={q.question_id}
            ref={legendRef}
            question={q}
            value={responses[q.question_id] ?? null}
            onChange={onChange}
            disabled={submitting}
            feedback={null}
            attemptId={attempt.id}
            remainingSec={remaining}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" onClick={() => void goTo(index - 1)} disabled={index === 0 || submitting}>
            <ChevronLeft aria-hidden="true" />
            {id.exam.run.prev}
          </Button>
          <Button
            variant="ghost"
            aria-pressed={isFlagged}
            onClick={() => toggleFlag(q.question_id)}
          >
            <Flag aria-hidden="true" className={isFlagged ? 'fill-current' : ''} />
            {isFlagged ? id.exam.run.unflag : id.exam.run.flag}
          </Button>
          <Button onClick={() => void goTo(index + 1)} disabled={index >= total - 1 || submitting}>
            {id.exam.run.next}
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </section>
    </ExamShell>
  );
}

/** Memuat attempt (GET /attempts/{id}); selesai/kadaluarsa dialihkan ke halaman hasil. */
export function ExamRunner({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const q = useQuery({
    queryKey: ['exam-attempt', attemptId],
    queryFn: ({ signal }) => attemptsApi.get(attemptId, signal),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const finished = q.data && q.data.status !== 'IN_PROGRESS';
  React.useEffect(() => {
    if (finished) router.replace(`/ujian/${attemptId}/hasil`);
  }, [finished, router, attemptId]);

  if (q.isPending || finished) return <Skeleton className="mx-auto mt-10 h-96 max-w-3xl rounded-xl" role="status" aria-label={id.common.loading} />;
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) {
      return (
        <div className="mx-auto mt-10 grid max-w-md gap-3 rounded-lg border bg-card p-6 text-center">
          <h1 className="text-xl font-bold">{id.exam.run.notFoundTitle}</h1>
          <p className="text-muted-foreground">{id.exam.run.notFoundBody}</p>
          <Button asChild className="mx-auto w-fit">
            <Link href="/peta">{id.exam.intro.backToMap}</Link>
          </Button>
        </div>
      );
    }
    return <ErrorState className="mx-auto mt-10 max-w-md" title={id.exam.run.loadFailed} onRetry={() => void q.refetch()} />;
  }
  if (q.data.assessment_type === 'TIER_BOSS_EXAM') return <BossRunner attempt={q.data} />;
  if (q.data.assessment_type === 'PLACEMENT_TEST') return <PlacementSession attempt={q.data} />;
  return <ExamSession attempt={q.data} />;
}
