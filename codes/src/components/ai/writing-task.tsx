'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { History, Info, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { fmt, id } from '@/i18n/id';
import { useMe } from '@/hooks/use-auth';
import { activeSubKey, clearDraft, draftKey as makeDraftKey } from '@/lib/ai/draft';
import { aiApi, type WritingSubmissionInput } from '@/lib/api/ai';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { formatTimeWib } from '@/lib/format';
import { SubmissionOutcome } from './submission-outcome';
import { AI_STATUS_KEY, submissionKey, useAiStatus, useSubmissionPolling } from './use-ai';
import { WritingEditor } from './writing-editor';

export type WritingContext =
  | { type: 'mini'; subModuleId: string }
  | { type: 'attempt'; attemptId: string; questionId: string; taskKind: 'TASK1' | 'TASK2' };

/** Id submission aktif disimpan (per pengguna) agar hasil dapat dibuka lagi setelah muat ulang. */
function activeKey(userId: string | undefined, ctx: WritingContext): string {
  return ctx.type === 'mini'
    ? activeSubKey({ userId, subModuleId: ctx.subModuleId, suffix: 'mini' })
    : activeSubKey({ userId, attemptId: ctx.attemptId, questionId: ctx.questionId });
}
function readActive(key: string): string | null {
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeActive(key: string, value: string | null) {
  if (!key) return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* penyimpanan tidak tersedia: hasil tetap tampil di sesi ini */
  }
}

/** Pesan galat pengiriman: kode detail validasi dulu, lalu kode galat, lalu pesan umum. */
export function submitErrorMessage(e: unknown, limit?: number): string {
  if (isApiError(e)) {
    if (e.code === 'VALIDATION_ERROR') {
      for (const d of e.details) {
        const m = id.ai.errors[d.code];
        if (m) return m;
      }
    }
    if (e.code === 'AI_DAILY_LIMIT_REACHED' && e.retryAfterSec && limit) {
      return fmt(id.ai.limitReached, { n: limit, time: formatTimeWib(new Date(Date.now() + e.retryAfterSec * 1000).toISOString()) });
    }
  }
  return apiErrorMessage(e);
}

/**
 * Alur Writing lengkap: editor -> kirim -> status job -> EvaluationCard / fallback (SPEC-012).
 * Dipakai untuk Mini-Task `AI_SHORT_WRITING` dan soal `WRITING_TASK` dalam attempt.
 */
export function WritingTask({
  context,
  prompt,
  stimulusUrl,
  minWords,
  remainingSec = null,
  onGraded,
}: {
  context: WritingContext;
  prompt: string;
  stimulusUrl?: string | null;
  /** Batas kata esai dari soal; null/undefined = Mini-Task. */
  minWords?: number | null;
  remainingSec?: number | null;
  /** Dipanggil sekali saat submission mencapai GRADED (Mini-Task selesai di server). */
  onGraded?: () => void;
}) {
  const qc = useQueryClient();
  const userId = useMe().data?.id;
  const aKey = activeKey(userId, context);
  const dKey = makeDraftKey(
    context.type === 'mini'
      ? { userId, subModuleId: context.subModuleId }
      : { userId, attemptId: context.attemptId, questionId: context.questionId },
  );
  const status = useAiStatus();
  const [submissionId, setSubmissionId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSubmissionId(readActive(aKey));
  }, [aKey]);

  const sub = useSubmissionPolling(submissionId);
  const submission = sub.data ?? null;

  // Submission tersimpan sudah tidak ada (404): kembali ke editor.
  React.useEffect(() => {
    if (sub.error && isApiError(sub.error) && sub.error.status === 404) {
      writeActive(aKey, null);
      setSubmissionId(null);
    }
  }, [sub.error, aKey]);

  const notified = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (submission?.status === 'GRADED' && notified.current !== submission.id) {
      notified.current = submission.id;
      clearDraft(dKey);
      onGraded?.();
    }
  }, [submission?.status, submission?.id, onGraded, dKey]);

  const create = useMutation({
    mutationFn: (text: string) => {
      const base = { response_text: text.normalize('NFC').trim() };
      const body: WritingSubmissionInput =
        context.type === 'mini'
          ? { kind: 'MINI_TASK_WRITING', sub_module_id: context.subModuleId, ...base }
          : {
              kind: context.taskKind === 'TASK1' ? 'WRITING_TASK1' : 'WRITING_TASK2',
              attempt_id: context.attemptId,
              question_id: context.questionId,
              ...base,
            };
      return aiApi.createWriting(body);
    },
    onSuccess: (res) => {
      setError(null);
      qc.setQueryData(submissionKey(res.submission.id), res.submission);
      qc.setQueryData(AI_STATUS_KEY, (old: unknown) => (old ? { ...(old as object), quota: res.quota } : old));
      writeActive(aKey, res.submission.id);
      clearDraft(dKey);
      setSubmissionId(res.submission.id);
    },
    onError: (e) => setError(submitErrorMessage(e, status.data?.quota.limit)),
  });

  function again() {
    writeActive(aKey, null);
    clearDraft(dKey);
    setSubmissionId(null);
    setError(null);
    notified.current = null;
  }

  const locked = submission !== null;
  const quota = status.data?.quota ?? null;
  const isMini = context.type === 'mini';
  const effectiveMin = isMini ? null : (minWords ?? null);

  return (
    <div className="grid gap-5" data-testid="writing-task">
      {status.data && status.data.enabled && !status.data.available ? (
        <p role="status" className="flex items-start gap-2 rounded-md border border-[var(--color-info)] bg-[var(--color-info)]/10 p-3 text-sm" data-testid="ai-unavailable-banner">
          <Info className="mt-0.5 size-4 shrink-0 text-[var(--color-info)]" aria-hidden="true" />
          {id.ai.unavailableBanner}
        </p>
      ) : null}

      <WritingEditor
        prompt={prompt}
        stimulusUrl={stimulusUrl}
        minWords={effectiveMin}
        minToSubmit={isMini ? 5 : 20}
        remainingSec={isMini ? null : remainingSec}
        draftKey={dKey}
        quota={quota}
        submitting={create.isPending}
        locked={locked}
        error={error}
        onSubmit={(text) => create.mutate(text)}
      />

      {quota && quota.limit > 0 && !locked ? (
        <p className="text-sm text-muted-foreground" data-testid="quota-line">
          {fmt(id.ai.quotaLine, { n: quota.remaining, limit: quota.limit })}
        </p>
      ) : null}

      {submission ? (
        <div aria-label={id.ai.writing.resultRegion} role="region" className="grid gap-4">
          <SubmissionOutcome
            submission={submission}
            minWords={effectiveMin}
            estimatedWaitSec={status.data?.queue.estimated_wait_sec ?? null}
          />
          <div className="flex flex-wrap gap-3">
            {isMini && submission.status === 'GRADED' ? (
              <Button variant="outline" onClick={again}>
                <RotateCcw aria-hidden="true" />
                {id.ai.writing.again}
              </Button>
            ) : null}
            {submission.status === 'GRADED' ? (
              <Button asChild variant="ghost">
                <Link href={`/riwayat/penilaian/${submission.id}`}>
                  <History aria-hidden="true" />
                  {id.ai.history.viewHistory}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
