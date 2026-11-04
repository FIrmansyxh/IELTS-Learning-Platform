'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { isAnswerReady } from '@/components/quiz/answer-utils';
import { ExamShell } from '@/components/quiz/exam-shell';
import { QuestionRenderer } from '@/components/quiz/question-renderer';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { QuestionPublicSchema, type AnswerResponse, type Attempt, type QuestionPublic } from '@/contracts/attempts';
import { fmt, id } from '@/i18n/id';
import { attemptsApi } from '@/lib/api/attempts';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';

const ENDED = ['ATTEMPT_EXPIRED', 'ATTEMPT_NOT_ACTIVE'];
const RESYNC = ['QUESTION_ALREADY_ANSWERED', 'QUESTION_NOT_CURRENT'];
const SUBMIT_TOAST = 'placement-submit-failed';

/** Soal yang sedang menunggu jawaban = soal tersaji terakhir yang belum punya jawaban tersimpan. */
export function pendingQuestion(attempt: Attempt): QuestionPublic | null {
  const answered = new Set(attempt.answers.map((a) => a.question_id));
  return [...attempt.questions].reverse().find((q) => !answered.has(q.question_id)) ?? null;
}

/**
 * Placement Test adaptif (SPEC-015): satu soal per layar, tanpa navigator/Sebelumnya/umpan balik. "Jawab" mengirim
 * jawaban lalu memuat `next_question`; `null` berarti tes selesai dan attempt dikirim. Soal berikutnya dipilih server.
 */
export function PlacementSession({ attempt }: { attempt: Attempt }) {
  const router = useRouter();
  const total = attempt.question_count;
  const [current, setCurrent] = React.useState<QuestionPublic | null>(() => pendingQuestion(attempt));
  const [answered, setAnswered] = React.useState(() => Math.max(attempt.answered_count, attempt.answers.length));
  const [value, setValue] = React.useState<AnswerResponse | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [finishing, setFinishing] = React.useState(false);
  const [timeUp, setTimeUp] = React.useState(false);
  const [announce, setAnnounce] = React.useState('');
  const legendRef = React.useRef<HTMLLegendElement | null>(null);
  const savingRef = React.useRef(false);
  const finishingRef = React.useRef(false);

  const skew = React.useRef(Date.parse(attempt.server_now) - Date.now());
  const deadline = attempt.deadline_at ? Date.parse(attempt.deadline_at) : null;
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - (now + skew.current)) / 1000));

  const goResult = React.useCallback(() => router.replace(`/ujian/${attempt.id}/hasil`), [router, attempt.id]);

  /** Kirim attempt (hasil dihitung dari soal yang sudah dijawab) lalu buka hasil. */
  const finish = React.useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    try {
      await attemptsApi.submit(attempt.id);
      toast.dismiss(SUBMIT_TOAST);
      goResult();
    } catch (e) {
      if (isApiError(e) && ENDED.includes(e.code)) {
        goResult();
        return;
      }
      finishingRef.current = false;
      setFinishing(false);
      toast.error(id.placement.run.submitFailed, { id: SUBMIT_TOAST });
    }
  }, [attempt.id, goResult]);

  // Sinkron ulang dari server (jawaban ganda dari perangkat lain / soal bukan yang saat ini).
  const resync = React.useCallback(async () => {
    try {
      const fresh = await attemptsApi.get(attempt.id);
      if (fresh.status !== 'IN_PROGRESS') {
        goResult();
        return;
      }
      setCurrent(pendingQuestion(fresh));
      setAnswered(Math.max(fresh.answered_count, fresh.answers.length));
      setValue(null);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }, [attempt.id, goResult]);

  const submitAnswer = React.useCallback(async () => {
    if (!current || !value || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const out = await attemptsApi.answer(attempt.id, current.question_id, value);
      const next = QuestionPublicSchema.nullable().safeParse(out.next_question ?? null);
      if (!next.success) {
        toast.error(id.apiErrors.RESPONSE_INVALID!);
        return;
      }
      setAnswered(out.answered_count);
      setValue(null);
      if (next.data === null) {
        setCurrent(null);
        void finish();
      } else {
        setCurrent(next.data);
        setAnnounce(fmt(id.placement.run.progress, { n: out.answered_count + 1, total }));
      }
    } catch (e) {
      if (isApiError(e) && ENDED.includes(e.code)) {
        setTimeUp(true);
      } else if (isApiError(e) && RESYNC.includes(e.code)) {
        toast.error(apiErrorMessage(e));
        await resync();
      } else {
        toast.error(id.placement.run.saveFailed, {
          action: { label: id.common.retry, onClick: () => void submitAnswer() },
        });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [attempt.id, current, value, total, finish, resync]);

  // Soal baru: fokus ke kepala soal (design-system / SPEC-015 aksesibilitas).
  React.useEffect(() => {
    if (current) legendRef.current?.focus();
  }, [current]);

  // Waktu habis: Dialog informatif, lalu hasil dihitung dari soal yang sudah dijawab.
  React.useEffect(() => {
    if (remaining === 0 && !finishingRef.current) setTimeUp(true);
  }, [remaining]);

  // Semua soal sudah dijawab tetapi attempt belum dikirim (mis. muat ulang di antara jawaban terakhir dan kirim).
  React.useEffect(() => {
    if (!current && !finishingRef.current) void finish();
  }, [current, finish]);

  if (!current) {
    return <Skeleton className="mx-auto mt-10 h-96 max-w-3xl rounded-xl" role="status" aria-label={id.common.loading} />;
  }

  const n = answered + 1;
  const ready = isAnswerReady(current, value);
  return (
    <>
      <ExamShell
        title={attempt.title}
        remainingSeconds={remaining}
        unansweredCount={0}
        onEnd={() => void finish()}
        labels={{
          endTitle: id.placement.run.endTitle,
          endBody: id.placement.run.endBody,
          endConfirm: id.placement.run.endConfirm,
        }}
      >
        <section className="grid gap-4" aria-label={fmt(id.placement.run.progress, { n, total })}>
          <div className="grid gap-2">
            <p className="text-sm font-semibold" data-testid="question-counter">
              {fmt(id.placement.run.progress, { n, total })}
            </p>
            <Progress
              value={total > 0 ? Math.round((answered / total) * 100) : 0}
              aria-label={id.placement.run.progressLabel}
              className="bg-border"
            />
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {announce}
          </p>
          <div className="rounded-xl border bg-card p-4 sm:p-6">
            <QuestionRenderer
              key={current.question_id}
              ref={legendRef}
              question={current}
              value={value}
              onChange={setValue}
              disabled={saving || finishing}
              feedback={null}
              attemptId={attempt.id}
              remainingSec={remaining}
            />
          </div>
          <Button size="lg" className="w-full sm:w-fit" disabled={!ready || finishing} loading={saving} onClick={() => void submitAnswer()}>
            {saving ? id.placement.run.saving : id.placement.run.answer}
          </Button>
        </section>
      </ExamShell>
      <Dialog open={timeUp} onOpenChange={() => undefined}>
        <DialogContent onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{id.placement.run.timeUpTitle}</DialogTitle>
            <DialogDescription>{id.placement.run.timeUpBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button loading={finishing} onClick={() => void finish()}>
              {id.placement.run.timeUpOk}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
