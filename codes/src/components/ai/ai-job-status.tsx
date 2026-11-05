'use client';

import React from 'react';
import { id, fmt } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { JobDTO, SubmissionStatusName } from '@/contracts/ai';

export interface AiJobStatusProps {
  job: JobDTO | null;
  status: SubmissionStatusName;
  onRetry?: () => void;
  onSelfAssess?: () => void;
  isRetrying?: boolean;
}

export function AiJobStatus({
  job,
  status,
  onRetry,
  onSelfAssess,
  isRetrying = false,
}: AiJobStatusProps) {
  if (status === 'FALLBACK_SELF_ASSESSMENT') {
    return (
      <div className="rounded-xl border border-border/80 bg-card p-6 shadow-xs flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-blue-100 dark:bg-blue-900/50 p-2 text-blue-700 dark:text-blue-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h4 className="font-semibold text-foreground text-sm">Penilaian Otomatis Sedang Nonaktif</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Gunakan fitur Penilaian Mandiri (Self-Assessment) untuk mengevaluasi jawaban Anda berdasarkan kriteria IELTS resmi.
            </p>
          </div>
        </div>
        {onSelfAssess && (
          <div className="flex justify-end">
            <Button onClick={onSelfAssess} variant="default" size="sm">
              {id.ai.actions.selfAssess}
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (status === 'FAILED') {
    const attempts = job?.attempt ?? 0;
    const canRetry = attempts < 3 && !!onRetry;

    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 shadow-xs flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-destructive/15 p-2 text-destructive">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h4 className="font-semibold text-destructive text-sm">{id.ai.status.failed}</h4>
            <p className="text-sm text-muted-foreground mt-1">
              {job?.error_code === 'LLM_TIMEOUT'
                ? id.ai.status.failedTimeout
                : 'Layanan evaluasi sedang mengalami kendala. Anda dapat mencoba lagi atau melakukan penilaian mandiri.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border/50">
          {onSelfAssess && (
            <Button onClick={onSelfAssess} variant="outline" size="sm">
              {id.ai.actions.selfAssess}
            </Button>
          )}
          {canRetry && (
            <Button onClick={onRetry} disabled={isRetrying} size="sm">
              {isRetrying
                ? 'Memproses...'
                : attempts > 0
                ? fmt(id.ai.actions.retryCount, { used: attempts })
                : id.ai.actions.retry}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const isQueued = status === 'RECEIVED' || job?.status === 'QUEUED';
  const isTranscribing = status === 'TRANSCRIBING' || job?.stage === 'TRANSCRIBING';

  const title = isQueued
    ? job?.queue_position
      ? fmt(id.ai.status.queued, { n: job.queue_position })
      : id.ai.status.queuedNoPos
    : isTranscribing
    ? id.ai.status.transcribing
    : id.ai.status.grading;

  const progress = job?.progress_percent ?? (isQueued ? 5 : 45);

  return (
    <div className="rounded-xl border border-border/80 bg-card p-6 shadow-xs flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Model AI sedang menganalisis struktur dan kosakata jawaban Anda.
          </p>
        </div>
      </div>

      <div className="w-full">
        <Progress value={progress} className="h-2" />
      </div>
    </div>
  );
}
