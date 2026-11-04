'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ServerCrash } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { id } from '@/i18n/id';
import { aiApi } from '@/lib/api/ai';
import { isSpeakingKind, type Submission } from '@/lib/api/ai-contract';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { NON_RETRYABLE_CODES } from '@/lib/ai/job';
import { AiJobStatus } from './ai-job-status';
import { EvaluationCard } from './evaluation-card';
import { SelfAssessmentForm } from './self-assessment-form';
import { AI_STATUS_KEY, submissionKey } from './use-ai';

function failureMessage(code: string | null): string {
  return (code && id.ai.fallback.errors[code]) || id.ai.fallback.title;
}

/** Kartu gagal/fallback: Coba lagi (hanya FAILED yang boleh), Nilai sendiri, atau Rekam ulang. */
function FallbackCard({
  submission,
  onRetry,
  retrying,
  retryBlocked,
  onSelf,
  onReRecord,
}: {
  submission: Submission;
  onRetry: () => void;
  retrying: boolean;
  retryBlocked: boolean;
  onSelf: () => void;
  onReRecord?: () => void;
}) {
  const code = submission.job?.error_code ?? null;
  const failed = submission.status === 'FAILED';
  const nonRetryable = code !== null && NON_RETRYABLE_CODES.includes(code);
  const canRetry = failed && !nonRetryable && !retryBlocked;
  const speaking = isSpeakingKind(submission.kind);
  return (
    <section
      aria-label={id.ai.job.region}
      data-testid="ai-fallback"
      data-status={submission.status}
      className="grid min-h-44 content-start gap-4 rounded-xl border border-[var(--color-warning)] bg-card p-4 sm:p-6"
    >
      <div role="alert" className="flex items-start gap-3">
        <ServerCrash className="mt-0.5 size-5 shrink-0 text-[var(--color-accent-text)]" aria-hidden="true" />
        <p className="font-semibold">{failed ? failureMessage(code) : id.ai.fallback.title}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {canRetry ? (
          <Button variant="outline" onClick={onRetry} loading={retrying}>
            {retrying ? id.ai.fallback.retrying : id.ai.fallback.retry}
          </Button>
        ) : null}
        {nonRetryable && speaking && onReRecord ? (
          <Button variant="outline" onClick={onReRecord}>
            {id.ai.fallback.reRecord}
          </Button>
        ) : null}
        <Button onClick={onSelf}>{id.ai.fallback.selfAssess}</Button>
      </div>
      {canRetry ? <p className="text-xs text-muted-foreground">{id.ai.fallback.retryHint}</p> : null}
    </section>
  );
}

/**
 * Menampilkan hasil sesuai status submission: job (antre/memproses), EvaluationCard (GRADED), atau
 * kartu fallback (FAILED / FALLBACK_SELF_ASSESSMENT) dengan Coba lagi dan form Nilai sendiri.
 */
export function SubmissionOutcome({
  submission,
  minWords,
  estimatedWaitSec,
  extra,
  onReRecord,
}: {
  submission: Submission;
  minWords?: number | null;
  estimatedWaitSec?: number | null;
  /** Slot di dalam EvaluationCard (rekaman Speaking). */
  extra?: React.ReactNode;
  onReRecord?: () => void;
}) {
  const qc = useQueryClient();
  const [selfOpen, setSelfOpen] = React.useState(false);
  const [retryBlocked, setRetryBlocked] = React.useState(false);

  const put = (s: Submission) => qc.setQueryData(submissionKey(s.id), s);

  const retry = useMutation({
    mutationFn: () => aiApi.retry(submission.id),
    onSuccess: (res) => {
      put(res.submission);
      void qc.invalidateQueries({ queryKey: AI_STATUS_KEY });
    },
    onError: (e) => {
      if (isApiError(e) && (e.code === 'RETRY_LIMIT_REACHED' || e.code === 'SUBMISSION_NOT_RETRYABLE' || e.code === 'AI_DISABLED')) {
        setRetryBlocked(true);
      }
      toast.error(apiErrorMessage(e));
    },
  });

  const self = useMutation({
    mutationFn: (scores: Record<string, number>) => aiApi.selfAssess(submission.id, scores),
    onSuccess: (res) => {
      put({ ...res.submission, evaluation: res.submission.evaluation ?? res.evaluation });
      setSelfOpen(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const { status } = submission;
  if (status === 'GRADED' && submission.evaluation) {
    return (
      <EvaluationCard evaluation={submission.evaluation} kind={submission.kind} responseText={submission.response_text} minWords={minWords}>
        {extra}
      </EvaluationCard>
    );
  }
  if (status === 'FAILED' || status === 'FALLBACK_SELF_ASSESSMENT') {
    return (
      <div className="grid gap-4">
        <FallbackCard
          submission={submission}
          onRetry={() => retry.mutate()}
          retrying={retry.isPending}
          retryBlocked={retryBlocked}
          onSelf={() => setSelfOpen(true)}
          onReRecord={onReRecord}
        />
        {selfOpen ? (
          <SelfAssessmentForm
            speaking={isSpeakingKind(submission.kind)}
            pending={self.isPending}
            onSubmit={(scores) => self.mutate(scores)}
            onCancel={() => setSelfOpen(false)}
          />
        ) : null}
      </div>
    );
  }
  return <AiJobStatus submission={submission} estimatedWaitSec={estimatedWaitSec} />;
}
