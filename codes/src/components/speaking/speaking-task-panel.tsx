'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Cpu } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { AiJobStatus } from '@/components/ai/ai-job-status';
import { EvaluationCard } from '@/components/ai/evaluation-card';
import { SelfAssessmentForm } from '@/components/ai/self-assessment-form';
import type { SubmissionDTO } from '@/contracts/ai';
import { ME_KEY, useMe } from '@/hooks/use-auth';
import { id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';
import { submissionsApi } from '@/lib/api/submissions';
import { SpeakingExternalPromptCard } from './external-prompt-card';
import type { ExternalScoreContext } from './external-score-form';
import { SpeakingRecorder } from './speaking-recorder';

const ACTIVE = new Set(['RECEIVED', 'TRANSCRIBING', 'GRADING']);
const POLL_MS = 3000;
export const AI_STATUS_KEY = ['ai-status'] as const;

export interface SpeakingTaskPanelProps {
  /** Konteks pengiriman rekaman; tanpa konteks (mis. materi belum selesai) perekam tidak ditampilkan. */
  context?: ExternalScoreContext;
  promptText: string;
  cuePoints?: string[];
  prepSeconds?: number;
  recordSeconds?: number;
  /** Prompt AI suara pihak ketiga, selalu tersedia sebagai cadangan. */
  externalPrompt: string;
  /** Pesan saat konteks belum ada (mis. materi belum selesai). */
  disabledHint?: string;
  onSubmitted?: (submission: SubmissionDTO) => void;
  /** Dipanggil setelah skor AI eksternal (cadangan) tersimpan. */
  onExternalSaved?: () => void;
}

/** Status penilai Speaking lokal (ADR-004 Addendum 3). Gagal dimuat = dianggap nonaktif. */
export function useSpeakingEnabled() {
  const q = useQuery({
    queryKey: AI_STATUS_KEY,
    queryFn: ({ signal }) => submissionsApi.aiStatus(signal),
    staleTime: 60_000,
    retry: false,
  });
  return { enabled: q.data?.speaking_enabled === true, loading: q.isPending, retentionDays: q.data?.recording_retention_days };
}

/**
 * Panel Speaking end-to-end: rekam di browser, STT whisper.cpp dan penilaian LLM di laptop, lalu hasil.
 * Prompt AI suara pihak ketiga tetap tersedia sebagai cadangan (dan menjadi tampilan utama bila penilai lokal nonaktif).
 */
export function SpeakingTaskPanel({
  context,
  promptText,
  cuePoints,
  prepSeconds,
  recordSeconds,
  externalPrompt,
  disabledHint,
  onSubmitted,
  onExternalSaved,
}: SpeakingTaskPanelProps) {
  const t = id.speaking.panel;
  const status = useSpeakingEnabled();
  const me = useMe();
  const qc = useQueryClient();
  const [submission, setSubmission] = React.useState<SubmissionDTO | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [selfOpen, setSelfOpen] = React.useState(false);
  const [recorderKey, setRecorderKey] = React.useState(0);

  const activeId = submission && ACTIVE.has(submission.status) ? submission.id : null;
  React.useEffect(() => {
    if (!activeId) return;
    const ctrl = new AbortController();
    const timer = window.setInterval(() => {
      submissionsApi
        .get(activeId, ctrl.signal)
        .then(setSubmission)
        .catch(() => {
          /* gangguan sementara: coba lagi pada putaran berikutnya */
        });
    }, POLL_MS);
    return () => {
      ctrl.abort();
      window.clearInterval(timer);
    };
  }, [activeId]);

  if (status.loading) return null;
  if (!status.enabled) return <SpeakingExternalPromptCard prompt={externalPrompt} context={context} onSaved={onExternalSaved} />;

  function created(sub: SubmissionDTO) {
    setSubmission(sub);
    // Persetujuan rekaman mungkin baru diberikan di dialog; segarkan profil.
    void qc.invalidateQueries({ queryKey: ME_KEY });
    onSubmitted?.(sub);
  }

  function rerecord() {
    setSubmission(null);
    setSelfOpen(false);
    setRecorderKey((k) => k + 1);
  }

  async function retry() {
    if (!submission) return;
    setBusy(true);
    try {
      const res = await submissionsApi.retry(submission.id);
      setSubmission(res.submission);
    } catch (err) {
      toast.error(isApiError(err) && err.status !== 0 ? err.message : t.retryFailed);
    } finally {
      setBusy(false);
    }
  }

  async function selfAssess(scores: Record<string, number>) {
    if (!submission) return;
    setBusy(true);
    try {
      const res = await submissionsApi.selfAssess(submission.id, scores);
      setSubmission(res.submission);
      setSelfOpen(false);
    } catch (err) {
      toast.error(isApiError(err) && err.status !== 0 ? err.message : t.selfFailed);
    } finally {
      setBusy(false);
    }
  }

  let main: React.ReactNode;
  if (!context) {
    main = <p className="text-sm text-muted-foreground">{disabledHint ?? t.needLearn}</p>;
  } else if (!submission) {
    main = me.data ? (
      <SpeakingRecorder
        key={recorderKey}
        kind={context.kind}
        attemptId={context.attempt_id ?? null}
        questionId={context.question_id ?? null}
        subModuleId={context.sub_module_id ?? null}
        promptText={promptText}
        cuePoints={cuePoints}
        prepSeconds={prepSeconds ?? (context.kind === 'SPEAKING_PART2' ? 60 : 0)}
        recordSeconds={Math.min(recordSeconds ?? 120, 140)}
        hasConsented={!!me.data.consent_recording_at}
        retentionDays={status.retentionDays}
        onSubmissionCreated={created}
      />
    ) : null;
  } else if (submission.evaluation) {
    main = (
      <EvaluationCard
        evaluation={submission.evaluation}
        responseText={submission.response_text}
        recording={submission.recording}
        submissionId={submission.id}
      />
    );
  } else if (selfOpen) {
    main = <SelfAssessmentForm kind="speaking" onSubmit={selfAssess} onCancel={() => setSelfOpen(false)} isSubmitting={busy} />;
  } else {
    main = (
      <AiJobStatus
        job={submission.job}
        status={submission.status}
        onRetry={retry}
        onSelfAssess={() => setSelfOpen(true)}
        onRerecord={submission.status === 'FAILED' ? rerecord : undefined}
        isRetrying={busy}
      />
    );
  }

  return (
    <div data-testid="speaking-task-panel" className="grid gap-4">
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Cpu className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t.localNote}
      </p>
      {main}
      <details className="rounded-lg border p-3 text-sm" data-testid="speaking-backup">
        <summary className="cursor-pointer select-none font-medium">{t.backupSummary}</summary>
        <p className="mt-2 text-xs text-muted-foreground">{t.backupHint}</p>
        <div className="mt-3">
          <SpeakingExternalPromptCard prompt={externalPrompt} context={context} onSaved={onExternalSaved} />
        </div>
      </details>
    </div>
  );
}
