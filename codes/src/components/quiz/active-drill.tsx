'use client';

import { Timer } from 'lucide-react';
import * as React from 'react';
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
import type { AnswerResponse, Attempt, AttemptResult, Feedback, QuestionPublic } from '@/contracts/attempts';
import { useShortcutPref } from '@/hooks/use-shortcut-pref';
import { fmt, id } from '@/i18n/id';
import { attemptsApi } from '@/lib/api/attempts';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { formatClock } from '@/lib/format';
import { cn } from '@/lib/utils';
import { coerceStored, initialResponse, isAiQuestion, isAnswerReady } from './answer-utils';
import { FeedbackPanel } from './feedback-panel';
import { QuestionRenderer } from './question-renderer';

const DEFAULT_TARGET_SEC = 20;

type Maps = {
  answered: Record<string, boolean>;
  responses: Record<string, AnswerResponse | null>;
  feedbacks: Record<string, Feedback | null>;
};

function mapsFromAttempt(attempt: Attempt): Maps {
  const answered: Maps['answered'] = {};
  const responses: Maps['responses'] = {};
  const feedbacks: Maps['feedbacks'] = {};
  for (const q of attempt.questions) responses[q.question_id] = initialResponse(q);
  for (const a of attempt.answers) {
    answered[a.question_id] = true;
    responses[a.question_id] = coerceStored(a.response);
    feedbacks[a.question_id] = a.feedback;
  }
  return { answered, responses, feedbacks };
}

/** Indeks awal: `q` dari SPEC-007 dibatasi ke soal tak terjawab pertama; semua terjawab = soal terakhir. */
export function resolveStartIndex(attempt: Attempt, q: number | null | undefined): number {
  const last = Math.max(0, attempt.questions.length - 1);
  const cap = Math.min(attempt.current_index, last);
  if (q === null || q === undefined) return cap;
  return Math.max(0, Math.min(q, cap));
}

/**
 * Active Drill (mode PRACTICE): satu soal per layar, "Periksa" lalu umpan balik instan, "Lanjut",
 * submit pada soal terakhir. Klien tidak menghitung skor; hanya mengirim `response`.
 */
export function ActiveDrill({
  attempt,
  startIndex,
  onFinished,
  onIndexChange,
  contextSlot,
}: {
  attempt: Attempt;
  startIndex?: number | null;
  onFinished: (result: AttemptResult) => void;
  onIndexChange?: (index: number, attemptId: string) => void;
  /** Konten pendamping di atas kartu soal (mis. teks bacaan pada Latihan Campur). */
  contextSlot?: (question: QuestionPublic) => React.ReactNode;
}) {
  const questions = attempt.questions;
  const total = questions.length;
  const [maps, setMaps] = React.useState<Maps>(() => mapsFromAttempt(attempt));
  const [index, setIndex] = React.useState(() => resolveStartIndex(attempt, startIndex));
  const [busy, setBusy] = React.useState<'check' | 'submit' | null>(null);
  const [expired, setExpired] = React.useState(false);
  const [shortcuts] = useShortcutPref();
  const legendRef = React.useRef<HTMLLegendElement | null>(null);
  const q = questions[index];

  /* ---------- timer ---------- */
  const skew = React.useRef(Date.parse(attempt.server_now) - Date.now());
  const questionStart = React.useRef(Date.now());
  const frozen = React.useRef<Record<string, number>>({});
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  React.useEffect(() => {
    questionStart.current = Date.now();
  }, [index]);

  const totalRemaining = Math.max(
    0,
    attempt.time_limit_seconds - Math.floor((now + skew.current - Date.parse(attempt.started_at)) / 1000),
  );
  const wasPositive = React.useRef(totalRemaining > 0);
  React.useEffect(() => {
    if (totalRemaining > 0) wasPositive.current = true;
    else if (wasPositive.current) {
      wasPositive.current = false;
      toast.info(id.quiz.timeUp);
    }
  }, [totalRemaining]);

  /* ---------- fokus & laporan posisi ---------- */
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    onIndexChange?.(index, attempt.id);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    legendRef.current?.focus();
  }, [index, attempt.id, onIndexChange]);

  if (!q) return null;

  const ai = isAiQuestion(q);
  const isAnswered = maps.answered[q.question_id] === true;
  const response = maps.responses[q.question_id] ?? null;
  const feedback = maps.feedbacks[q.question_id] ?? null;
  const ready = ai || isAnswered || isAnswerReady(q, response);
  const lastQuestion = index >= total - 1;
  const done = ai || isAnswered;

  const qElapsedLive = Math.floor((now - questionStart.current) / 1000);
  const qElapsed = done ? (frozen.current[q.question_id] ?? qElapsedLive) : qElapsedLive;
  const targetSec = q.target_time_ms ? q.target_time_ms / 1000 : DEFAULT_TARGET_SEC;
  const slow = !done && qElapsed > targetSec;

  const reload = async () => {
    try {
      const fresh = await attemptsApi.get(attempt.id);
      setMaps(mapsFromAttempt(fresh));
    } catch {
      /* biarkan state lokal */
    }
  };

  const finishFromExpired = async () => {
    try {
      const res = await attemptsApi.result(attempt.id);
      onFinished(res);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  const check = async () => {
    if (busy || isAnswered || !response || !ready) return;
    setBusy('check');
    frozen.current[q.question_id] = Math.floor((Date.now() - questionStart.current) / 1000);
    try {
      const res = await attemptsApi.answer(attempt.id, q.question_id, response);
      setMaps((m) => ({
        answered: { ...m.answered, [q.question_id]: true },
        responses: m.responses,
        feedbacks: { ...m.feedbacks, [q.question_id]: res.feedback },
      }));
    } catch (e) {
      delete frozen.current[q.question_id];
      if (isApiError(e) && (e.code === 'ATTEMPT_EXPIRED' || e.code === 'ATTEMPT_NOT_ACTIVE')) {
        setExpired(true);
      } else if (isApiError(e) && e.code === 'QUESTION_ALREADY_ANSWERED') {
        toast.error(apiErrorMessage(e));
        await reload();
      } else {
        toast.error(id.quiz.answerNotSaved, {
          duration: Infinity,
          action: { label: id.common.retry, onClick: () => void check() },
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const advance = async () => {
    if (busy) return;
    if (!lastQuestion) {
      setIndex((i) => i + 1);
      return;
    }
    setBusy('submit');
    try {
      const res = await attemptsApi.submit(attempt.id);
      onFinished(res);
    } catch (e) {
      if (isApiError(e) && (e.code === 'ATTEMPT_EXPIRED' || e.code === 'ATTEMPT_NOT_ACTIVE')) setExpired(true);
      else toast.error(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const primary = () => (done ? void advance() : void check());

  const setResponse = (next: AnswerResponse | null) =>
    setMaps((m) => ({ ...m, responses: { ...m.responses, [q.question_id]: next } }));

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!shortcuts || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    const tag = target.tagName;
    const inputType = (target as HTMLInputElement).type;
    const typing =
      tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['radio', 'checkbox'].includes(inputType));
    if (e.key === 'Enter') {
      if (tag === 'BUTTON' || tag === 'A' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      primary();
      return;
    }
    if (typing || isAnswered || (q.question_type !== 'MCQ_SINGLE' && q.question_type !== 'MCQ_MULTI')) return;
    const k = e.key.toLowerCase();
    const idx = /^[1-9]$/.test(k) ? Number(k) - 1 : k.length === 1 && k >= 'a' && k <= 'z' ? k.charCodeAt(0) - 97 : -1;
    const opt = q.options?.[idx];
    if (!opt) return;
    e.preventDefault();
    if (q.question_type === 'MCQ_SINGLE') {
      setResponse({ option_ids: [opt.option_id] });
    } else {
      const cur = new Set(response && 'option_ids' in response ? response.option_ids : []);
      if (cur.has(opt.option_id)) cur.delete(opt.option_id);
      else if (cur.size < (q.choose_count ?? q.options!.length)) cur.add(opt.option_id);
      setResponse(cur.size ? { option_ids: [...cur] } : null);
    }
  };

  const progressValue = Math.round(((index + (done ? 1 : 0)) / total) * 100);

  return (
    <section aria-label={attempt.title} onKeyDown={onKeyDown} className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="font-semibold" data-testid="question-counter">
            {fmt(id.quiz.questionOf, { n: index + 1, total })}
          </p>
          <div className="flex items-center gap-3 tabular-nums text-muted-foreground">
            <span
              role="timer"
              aria-label={id.quiz.timerQuestion}
              className={cn('inline-flex items-center gap-1', slow && 'font-semibold text-[var(--color-accent-text)]')}
            >
              <Timer className="size-4" aria-hidden="true" />
              {formatClock(qElapsed)}
            </span>
            {attempt.time_limit_seconds > 0 ? (
              <span role="timer" aria-label={id.quiz.timerTotal}>
                {formatClock(totalRemaining)}
              </span>
            ) : null}
          </div>
        </div>
        <Progress value={progressValue} aria-label={id.quiz.progress} className="h-1.5" />
      </div>

      {contextSlot?.(q)}

      <div className="rounded-xl border bg-card p-4 sm:p-6">
        <QuestionRenderer
          key={q.question_id}
          ref={legendRef}
          question={q}
          value={response}
          onChange={setResponse}
          disabled={isAnswered || busy !== null}
          feedback={feedback}
          attemptId={attempt.id}
        />
      </div>

      <FeedbackPanel feedback={feedback} />

      <div className="sticky bottom-[4.5rem] z-20 -mx-1 border-t bg-background/95 px-1 py-3 backdrop-blur lg:bottom-0">
        <Button
          size="lg"
          className="w-full"
          disabled={!ready}
          loading={busy !== null}
          onClick={primary}
        >
          {busy === 'check'
            ? id.quiz.checking
            : busy === 'submit'
              ? id.quiz.submitting
              : done
                ? lastQuestion
                  ? id.quiz.seeResult
                  : id.quiz.next
                : id.quiz.check}
        </Button>
      </div>

      <Dialog open={expired}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{id.quiz.expiredTitle}</DialogTitle>
            <DialogDescription>{id.quiz.expiredBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => void finishFromExpired()}>{id.quiz.expiredAction}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
