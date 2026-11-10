'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
import { QuestionRenderer } from '@/components/quiz/question-renderer';
import {
  initialResponse,
  isAnswerReady,
  coerceStored,
} from '@/components/quiz/answer-utils';
import type { Attempt, QuestionPublic } from '@/contracts/attempts';
import type { AnswerResponse } from '@/contracts/attempts';
import { attemptsApi } from '@/lib/api/attempts';
import { apiErrorMessage } from '@/lib/api/errors';
import { formatClock } from '@/lib/format';
import { fmt, id } from '@/i18n/id';

export function PlacementRunner({ attempt }: { attempt: Attempt }) {
  const router = useRouter();
  const totalQuestions = attempt.question_count || 25;

  const [currentQ, setCurrentQ] = React.useState<QuestionPublic | null>(() => {
    return attempt.questions[0] ?? null;
  });

  const [answeredCount, setAnsweredCount] = React.useState<number>(attempt.answered_count);
  const [currentResponse, setCurrentResponse] = React.useState<AnswerResponse | null>(() => {
    if (!attempt.questions[0]) return null;
    const existingAns = attempt.answers.find((a) => a.question_id === attempt.questions[0]!.question_id);
    return existingAns ? coerceStored(existingAns.response) : initialResponse(attempt.questions[0]);
  });

  const [saving, setSaving] = React.useState(false);
  const [ending, setEnding] = React.useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = React.useState(false);

  const legendRef = React.useRef<HTMLLegendElement | null>(null);
  const allowLeave = React.useRef(false);

  // Hitung timer dari server deadline
  const [now, setNow] = React.useState<number>(() => Date.now());
  const serverOffset = React.useMemo(() => {
    return Date.parse(attempt.server_now) - Date.now();
  }, [attempt.server_now]);

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = React.useMemo(() => {
    if (!attempt.deadline_at) return null;
    const deadline = Date.parse(attempt.deadline_at);
    const adjustedNow = now + serverOffset;
    return Math.max(0, Math.ceil((deadline - adjustedNow) / 1000));
  }, [attempt.deadline_at, now, serverOffset]);

  // BeforeUnload protection
  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowLeave.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Fokus ke kepala soal baru
  React.useEffect(() => {
    if (currentQ) {
      legendRef.current?.focus();
    }
  }, [currentQ]);

  const finishExam = React.useCallback(async () => {
    if (ending) return;
    setEnding(true);
    try {
      await attemptsApi.submit(attempt.id);
      allowLeave.current = true;
      router.replace(`/ujian/${attempt.id}/hasil`);
    } catch (e) {
      toast.error(apiErrorMessage(e));
      allowLeave.current = true;
      router.replace(`/ujian/${attempt.id}/hasil`);
    }
  }, [attempt.id, ending, router]);

  // Waktu habis: otomatis submit
  React.useEffect(() => {
    if (remaining === 0 && !ending) {
      void finishExam();
    }
  }, [remaining, ending, finishExam]);

  const handleAnswerSubmit = React.useCallback(async () => {
    if (!currentQ || !currentResponse || saving) return;
    setSaving(true);
    try {
      const outcome = await attemptsApi.answer(attempt.id, currentQ.question_id, currentResponse);
      const nextCount = outcome.answered_count;
      setAnsweredCount(nextCount);

      if (outcome.next_question) {
        const nq = outcome.next_question as QuestionPublic;
        setCurrentQ(nq);
        setCurrentResponse(initialResponse(nq));
      } else {
        // Tes selesai, otomatis submit
        await finishExam();
      }
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [currentQ, currentResponse, saving, attempt.id, finishExam]);

  const questionNum = answeredCount + 1;
  const progressPercent = Math.min(100, Math.round((answeredCount / totalQuestions) * 100));
  const isAnswered = currentQ ? isAnswerReady(currentQ, currentResponse) : false;

  return (
    <div className="min-h-dvh bg-background" data-testid="placement-runner">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background px-4 py-2.5 sm:px-6">
        <div>
          <h1 className="text-sm sm:text-base font-semibold">{id.placement.title}</h1>
          <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {fmt(id.quiz.questionOf, { n: Math.min(questionNum, totalQuestions), total: totalQuestions })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {remaining !== null && (
            <p className="tabular-nums text-sm font-medium" role="timer" aria-label={id.quiz.exam.timeLeft}>
              {formatClock(remaining)}
            </p>
          )}
          <Button variant="outline" size="sm" onClick={() => setConfirmEndOpen(true)}>
            {id.quiz.exam.end}
          </Button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="w-full">
        <Progress value={progressPercent} className="h-1 rounded-none" />
      </div>

      {/* Main Container */}
      <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-6 sm:py-8">
        {currentQ ? (
          <section className="grid gap-6">
            <div className="rounded-xl border bg-card p-4 sm:p-6 shadow-xs">
              <QuestionRenderer
                key={currentQ.question_id}
                ref={legendRef}
                question={currentQ}
                value={currentResponse}
                onChange={setCurrentResponse}
                disabled={saving || ending}
                feedback={null}
              />
            </div>

            <div className="flex justify-end">
              <Button
                size="lg"
                className="w-full sm:w-auto min-w-[140px]"
                disabled={!isAnswered || saving || ending}
                loading={saving}
                onClick={() => void handleAnswerSubmit()}
                data-testid="placement-answer-btn"
              >
                {id.placement.answerBtn}
              </Button>
            </div>
          </section>
        ) : (
          <p className="text-center text-muted-foreground">{id.common.loading}</p>
        )}
      </main>

      {/* Confirm End Dialog */}
      <Dialog open={confirmEndOpen} onOpenChange={setConfirmEndOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id.placement.endConfirmTitle}</DialogTitle>
            <DialogDescription>{id.placement.endConfirmBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEndOpen(false)}>
              {id.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmEndOpen(false);
                void finishExam();
              }}
            >
              {id.placement.endConfirmBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

