'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { AiJobStatus } from '@/components/ai/ai-job-status';
import { EvaluationCard } from '@/components/ai/evaluation-card';
import { SelfAssessmentForm } from '@/components/ai/self-assessment-form';
import { WritingEditor } from '@/components/writing/writing-editor';
import type { CreateWritingSubmissionRequest, SubmissionDTO } from '@/contracts/ai';
import { isApiError } from '@/lib/api/client';
import { submissionsApi } from '@/lib/api/submissions';

export type WritingContext = Pick<CreateWritingSubmissionRequest, 'kind' | 'attempt_id' | 'question_id' | 'sub_module_id'>;

const ACTIVE = new Set(['RECEIVED', 'TRANSCRIBING', 'GRADING']);
const POLL_MS = 3000;

/**
 * Panel Writing end-to-end (ADR-004): editor, kirim, antrean dan penilaian LLM lokal, lalu hasil.
 * Bila AI nonaktif atau gagal, pengguna dapat menilai sendiri (tidak dihitung ke radar).
 */
export function WritingTaskPanel({
  context,
  prompt,
  minWords,
  storageKey,
}: {
  context: WritingContext;
  prompt?: string;
  minWords?: number;
  storageKey?: string;
}) {
  const [submission, setSubmission] = React.useState<SubmissionDTO | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [selfOpen, setSelfOpen] = React.useState(false);
  const startedAt = React.useRef<number | null>(null);

  // Polling selama job aktif; berhenti saat status akhir atau komponen dilepas.
  const activeId = submission && ACTIVE.has(submission.status) ? submission.id : null;
  React.useEffect(() => {
    if (!activeId) return;
    const ctrl = new AbortController();
    const timer = window.setInterval(() => {
      submissionsApi
        .get(activeId, ctrl.signal)
        .then(setSubmission)
        .catch(() => {
          /* gangguan jaringan sementara: coba lagi pada putaran berikutnya */
        });
    }, POLL_MS);
    return () => {
      ctrl.abort();
      window.clearInterval(timer);
    };
  }, [activeId]);

  async function send(text: string) {
    setBusy(true);
    startedAt.current ??= Date.now();
    try {
      const res = await submissionsApi.createWriting({
        ...context,
        response_text: text,
        duration_sec: Math.min(7200, Math.round((Date.now() - startedAt.current) / 1000)),
      });
      setSubmission(res.submission);
    } catch (err) {
      toast.error(isApiError(err) && err.status !== 0 ? err.message : 'Tulisan belum terkirim. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!submission) return;
    setBusy(true);
    try {
      const res = await submissionsApi.retry(submission.id);
      setSubmission(res.submission);
    } catch (err) {
      toast.error(isApiError(err) && err.status !== 0 ? err.message : 'Belum bisa mengulang penilaian.');
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
      toast.error(isApiError(err) && err.status !== 0 ? err.message : 'Penilaian mandiri belum tersimpan.');
    } finally {
      setBusy(false);
    }
  }

  if (!submission) {
    return (
      <div data-testid="writing-task-panel">
        <WritingEditor
          prompt={prompt}
          kind={context.kind}
          minWords={minWords}
          storageKey={storageKey}
          onSubmit={send}
          isSubmitting={busy}
        />
      </div>
    );
  }

  return (
    <div data-testid="writing-task-panel" className="grid gap-4">
      {submission.evaluation ? (
        <EvaluationCard evaluation={submission.evaluation} responseText={submission.response_text} submissionId={submission.id} />
      ) : selfOpen ? (
        <SelfAssessmentForm kind="writing" onSubmit={selfAssess} onCancel={() => setSelfOpen(false)} isSubmitting={busy} />
      ) : (
        <AiJobStatus
          job={submission.job}
          status={submission.status}
          onRetry={retry}
          onSelfAssess={() => setSelfOpen(true)}
          isRetrying={busy}
        />
      )}
    </div>
  );
}
