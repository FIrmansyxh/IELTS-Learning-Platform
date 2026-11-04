'use client';

import { Check, Clock, Loader2 } from 'lucide-react';
import { fmt, id } from '@/i18n/id';
import { isSpeakingKind, type Submission } from '@/lib/api/ai-contract';
import { cn } from '@/lib/utils';

type Phase = 'queue' | 'stt' | 'grade';

/** Tahap saat ini dari status submission + job (job bisa null sesaat setelah status berubah). */
export function currentPhase(s: Pick<Submission, 'status' | 'job'>): Phase {
  const job = s.job;
  if (s.status === 'TRANSCRIBING' || job?.stage === 'TRANSCRIBING' || job?.kind === 'STT_TRANSCRIBE') {
    return job?.status === 'QUEUED' ? 'queue' : 'stt';
  }
  if (job?.status === 'QUEUED' || (s.status === 'RECEIVED' && job?.status !== 'RUNNING')) return 'queue';
  return 'grade';
}

function phaseLabel(s: Submission, phase: Phase): string {
  if (phase === 'queue') {
    const pos = s.job?.queue_position;
    return pos ? fmt(id.ai.job.queued, { n: pos }) : id.ai.job.queuedNoPos;
  }
  if (phase === 'stt') return id.ai.job.transcribing;
  if (s.job?.stage === 'SAVING') return id.ai.job.saving;
  return id.ai.job.grading;
}

/**
 * Status job AI: Antre (posisi) -> Memproses (bar tak-terbatas + estimasi) -> hasil di komponen lain.
 * `aria-live="polite"` agar perubahan diumumkan tanpa merebut fokus; tinggi minimum dicadangkan agar
 * peralihan ke hasil tidak menggeser konten di atasnya (CLS).
 */
export function AiJobStatus({ submission, estimatedWaitSec }: { submission: Submission; estimatedWaitSec?: number | null }) {
  const speaking = isSpeakingKind(submission.kind);
  const phase = currentPhase(submission);
  const label = phaseLabel(submission, phase);
  const steps: Array<{ key: Phase; label: string }> = speaking
    ? [
        { key: 'queue', label: id.ai.job.stepQueue },
        { key: 'stt', label: id.ai.job.stepStt },
        { key: 'grade', label: id.ai.job.stepGrade },
      ]
    : [
        { key: 'queue', label: id.ai.job.stepQueue },
        { key: 'grade', label: id.ai.job.stepGrade },
      ];
  const currentIdx = steps.findIndex((x) => x.key === phase);

  return (
    <section
      aria-label={id.ai.job.region}
      data-testid="ai-job-status"
      data-phase={phase}
      className="grid min-h-44 content-start gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <div role="status" aria-live="polite" className="flex items-center gap-3">
        {phase === 'queue' ? (
          <Clock className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Loader2 className="size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
        )}
        <p className="font-semibold">{label}</p>
      </div>

      {phase === 'queue' ? null : (
        <div className="h-2 w-full overflow-hidden rounded-full bg-primary/20" role="progressbar" aria-label={label}>
          <div className="h-full w-full animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
        </div>
      )}

      <ol aria-label={id.ai.job.steps} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {steps.map((st, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          return (
            <li
              key={st.key}
              aria-current={current ? 'step' : undefined}
              className={cn('flex items-center gap-1.5', current ? 'font-semibold' : 'text-muted-foreground')}
            >
              {done ? (
                <Check className="size-4 text-[var(--color-done-text)]" aria-hidden="true" />
              ) : (
                <span
                  aria-hidden="true"
                  className={cn('inline-block size-2.5 rounded-full border', current ? 'border-primary bg-primary' : 'border-muted-foreground')}
                />
              )}
              {st.label}
            </li>
          );
        })}
      </ol>

      <p className="text-sm text-muted-foreground">{id.ai.job.eta}</p>
      {phase === 'queue' && estimatedWaitSec ? (
        <p className="text-sm text-muted-foreground">{fmt(id.ai.job.estimate, { n: Math.max(1, Math.round(estimatedWaitSec)) })}</p>
      ) : null}
    </section>
  );
}
