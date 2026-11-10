'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { coerceStored, initialResponse, isAiQuestion, isAnswerReady } from '@/components/quiz/answer-utils';
import { ExamShell } from '@/components/quiz/exam-shell';
import { QuestionNavigatorGrid } from '@/components/quiz/question-navigator-grid';
import { QuestionRenderer } from '@/components/quiz/question-renderer';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BossExamRunner } from './boss-exam-runner';
import { PlacementRunner } from './placement-runner';
import { ReadingWorkspace } from '@/components/reading/reading-workspace';
import { ListeningPlayer } from '@/components/listening/listening-player';
import type { AnswerResponse, Attempt } from '@/contracts/attempts';
import { fmt, id } from '@/i18n/id';
import { attemptsApi } from '@/lib/api/attempts';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';

const SAVE_DEBOUNCE_MS = 400;

type SaveState = 'idle' | 'saving' | 'saved';
type SaveResult = 'ok' | 'failed' | 'ended';
/** Jeda sebelum pengiriman otomatis dicoba lagi setelah gagal (waktu habis). */
const AUTO_RETRY_MS = 3000;
const SUBMIT_FAIL_TOAST = 'exam-submit-failed';

/**
 * Sesi ujian berjalan (mode EXAM): tanpa umpan balik/kunci, jawaban boleh diganti sampai submit,
 * timer dihitung dari `deadline_at` server (selisih jam server disesuaikan sekali saat dimuat).
 */
export function ExamSession({
  attempt,
  onSectionSubmit,
  submitLabel,
}: {
  attempt: Attempt;
  onSectionSubmit?: () => Promise<void>;
  submitLabel?: string;
}) {
  const router = useRouter();
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
  const [flagged, setFlagged] = React.useState<Set<string>>(() => new Set());
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

  const sections = React.useMemo(() => {
    const s = new Set<number>();
    for (const qq of questions) {
      if (typeof qq.section_no === 'number') s.add(qq.section_no);
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [questions]);

  /* ---------- timer berdasarkan deadline server ---------- */
  const skew = React.useRef(Date.parse(attempt.server_now) - Date.now());
  const deadline = attempt.deadline_at ? Date.parse(attempt.deadline_at) : null;
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - (now + skew.current)) / 1000));

  const goResult = React.useCallback(() => router.replace(`/ujian/${attempt.id}/hasil`), [router, attempt.id]);

  const saveNow = React.useCallback(
    async (qid: string): Promise<SaveResult> => {
      const resp = latest.current[qid];
      const q = questions.find((x) => x.question_id === qid);
      if (!resp || !q || !isAnswerReady(q, resp)) return 'ok';
      setSaveState('saving');
      try {
        await attemptsApi.answer(attempt.id, qid, resp);
        failedSaves.current.delete(qid);
        setSaved((s) => new Set(s).add(qid));
        setSaveState('saved');
        return 'ok';
      } catch (e) {
        setSaveState('idle');
        if (isApiError(e) && (e.code === 'ATTEMPT_EXPIRED' || e.code === 'ATTEMPT_NOT_ACTIVE')) {
          allowLeave.current = true;
          goResult();
          return 'ended';
        }
        failedSaves.current.add(qid);
        toast.error(id.quiz.answerNotSaved, {
          duration: Infinity,
          action: { label: id.common.retry, onClick: () => void saveNow(qid) },
        });
        return 'failed';
      }
    },
    [attempt.id, questions, goResult],
  );

  /** Simpan semua jawaban tertunda dan yang sebelumnya gagal. 'failed' = ada yang belum tersimpan. */
  const flushPending = React.useCallback(async (): Promise<SaveResult> => {
    const pending = new Set<string>([...timers.current.keys(), ...failedSaves.current]);
    for (const qid of timers.current.keys()) {
      clearTimeout(timers.current.get(qid));
      timers.current.delete(qid);
    }
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
      if (onSectionSubmit) {
        await onSectionSubmit();
        toast.dismiss(SUBMIT_FAIL_TOAST);
        allowLeave.current = true;
        return;
      }
      await attemptsApi.submit(attempt.id);
      toast.dismiss(SUBMIT_FAIL_TOAST);
      allowLeave.current = true;
      goResult();
    } catch (e) {
      if (isApiError(e) && (e.code === 'ATTEMPT_EXPIRED' || e.code === 'ATTEMPT_NOT_ACTIVE')) {
        allowLeave.current = true;
        goResult();
        return;
      }
      nextAutoAt.current = Date.now() + AUTO_RETRY_MS;
      submittingRef.current = false;
      setSubmitting(false);
      toast.error(apiErrorMessage(e), { id: SUBMIT_FAIL_TOAST });
    }
  }, [flushPending, attempt.id, goResult, onSectionSubmit]);

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
    return () => {
      for (const t of map.values()) clearTimeout(t);
    };
  }, []);

  const q = questions[index];
  React.useEffect(() => {
    legendRef.current?.focus();
  }, [index]);
  if (!q) return null;

  const onChange = (next: AnswerResponse | null) => {
    setResponses((m) => ({ ...m, [q.question_id]: next }));
    latest.current = { ...latest.current, [q.question_id]: next };
    const old = timers.current.get(q.question_id);
    if (old) clearTimeout(old);
    timers.current.set(
      q.question_id,
      setTimeout(() => {
        timers.current.delete(q.question_id);
        void saveNow(q.question_id);
      }, SAVE_DEBOUNCE_MS),
    );
  };

  const isDone = (qid: string, qq: (typeof questions)[number]) =>
    !isAiQuestion(qq) && (saved.has(qid) || isAnswerReady(qq, responses[qid] ?? null));
  const items = questions.map((qq) => ({
    questionId: qq.question_id,
    answered: isDone(qq.question_id, qq),
    flagged: flagged.has(qq.question_id),
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

  const isFlagged = flagged.has(q.question_id);
  return (
    <ExamShell
      title={attempt.title}
      remainingSeconds={remaining}
      unansweredCount={total - answeredCount}
      onEnd={() => void finish()}
      endLabel={submitLabel}
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
        {attempt.listening && (
          <ListeningPlayer
            mode={attempt.mode}
            audioUrl={attempt.listening.audio_url}
            durationSec={attempt.listening.duration_sec}
            note={attempt.listening.note}
            attemptId={attempt.id}
          />
        )}
        {sections.length > 1 && (
          <div className="flex flex-wrap gap-2 border-b pb-2" role="tablist" aria-label={id.listening.sectionAria}>
            {sections.map((secNo) => {
              const isCurrentSec = q.section_no === secNo;
              return (
                <Button
                  key={secNo}
                  type="button"
                  variant={isCurrentSec ? 'default' : 'outline'}
                  size="sm"
                  role="tab"
                  aria-selected={isCurrentSec}
                  onClick={() => {
                    const firstIdx = questions.findIndex((qq) => qq.section_no === secNo);
                    if (firstIdx !== -1) void goTo(firstIdx);
                  }}
                >
                  {fmt(id.listening.sectionTab, { n: secNo })}
                </Button>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="font-semibold" data-testid="question-counter">
            {fmt(id.exam.run.questionOf, { n: index + 1, total })}
          </p>
          <p role="status" aria-live="polite" className="text-muted-foreground">
            {saveState === 'saving' ? id.exam.run.saving : saveState === 'saved' ? id.exam.run.saved : ''}
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
            onClick={() =>
              setFlagged((s) => {
                const n = new Set(s);
                if (n.has(q.question_id)) n.delete(q.question_id);
                else n.add(q.question_id);
                return n;
              })
            }
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

  if (q.isPending || finished) return <Skeleton className="mx-auto mt-10 h-96 max-w-5xl rounded-xl" role="status" aria-label={id.common.loading} />;
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
  if (q.data.assessment_type === 'TIER_BOSS_EXAM') {
    return <BossExamRunner attempt={q.data} />;
  }
  if (q.data.assessment_type === 'PLACEMENT_TEST') {
    return <PlacementRunner attempt={q.data} />;
  }
  if (q.data.passage_markdown) {
    return <ReadingWorkspace attempt={q.data} />;
  }
  return <ExamSession attempt={q.data} />;
}
