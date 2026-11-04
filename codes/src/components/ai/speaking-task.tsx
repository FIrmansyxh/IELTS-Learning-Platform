'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { History, Info, Mic } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useMe, useSetMe } from '@/hooks/use-auth';
import { fmt, id } from '@/i18n/id';
import { activeSubKey } from '@/lib/ai/draft';
import { aiApi, type SpeakingSubmissionInput } from '@/lib/api/ai';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { formatTimeWib } from '@/lib/format';
import { ConsentDialog } from './consent-dialog';
import { RecordingControls } from './recording-controls';
import { SpeakingRecorder } from './speaking-recorder';
import { SubmissionOutcome } from './submission-outcome';
import { AI_STATUS_KEY, submissionKey, useAiStatus, useSubmissionPolling } from './use-ai';
import type { RecordedClip } from './use-voice-recorder';
import { recordingSupport } from './use-voice-recorder';
import { submitErrorMessage } from './writing-task';

export type SpeakingContext =
  | { type: 'mini'; subModuleId: string }
  | { type: 'attempt'; attemptId: string; questionId: string; part: 1 | 2 | 3 };

/** Terikat pengguna (F-12-04); dihapus saat logout/401 lewat `clearExamStorage`. */
function activeKey(userId: string | undefined, ctx: SpeakingContext): string {
  return ctx.type === 'mini'
    ? activeSubKey({ userId, subModuleId: ctx.subModuleId, suffix: 'mini-speaking' })
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
    /* tidak tersedia */
  }
}

function kindOf(ctx: SpeakingContext): SpeakingSubmissionInput['kind'] {
  if (ctx.type === 'mini') return 'MINI_TASK_SPEAKING';
  return ctx.part === 1 ? 'SPEAKING_PART1' : ctx.part === 3 ? 'SPEAKING_PART3' : 'SPEAKING_PART2';
}

/**
 * Alur Speaking lengkap (SPEC-013): HTTPS/dukungan -> persetujuan -> pra-cek mikrofon -> persiapan ->
 * rekam -> tinjau -> unggah -> status dua tahap -> hasil + transkrip + pemutar/hapus rekaman.
 */
export function SpeakingTask({
  context,
  prompt,
  cuePoints,
  prepSeconds,
  recordSeconds,
  onGraded,
}: {
  context: SpeakingContext;
  prompt: string;
  cuePoints?: string[];
  /** Detik persiapan; default 60 untuk Part 2, selain itu 0. */
  prepSeconds?: number;
  recordSeconds?: number;
  onGraded?: () => void;
}) {
  const qc = useQueryClient();
  const me = useMe();
  const setMe = useSetMe();
  const status = useAiStatus();
  const aKey = activeKey(me.data?.id, context);

  const [submissionId, setSubmissionId] = React.useState<string | null>(null);
  const [consentOpen, setConsentOpen] = React.useState(false);
  const [consentError, setConsentError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [percent, setPercent] = React.useState(0);
  const [session, setSession] = React.useState(0);
  const [{ secure, supported }] = React.useState(recordingSupport);

  React.useEffect(() => {
    setSubmissionId(readActive(aKey));
  }, [aKey]);

  const sub = useSubmissionPolling(submissionId);
  const submission = sub.data ?? null;

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
      onGraded?.();
    }
  }, [submission?.status, submission?.id, onGraded]);

  const consent = useMutation({
    mutationFn: aiApi.giveConsent,
    onSuccess: (user) => {
      setMe(user);
      setConsentOpen(false);
      setConsentError(null);
    },
    onError: (e) => setConsentError(apiErrorMessage(e)),
  });

  const create = useMutation({
    mutationFn: (clip: RecordedClip) => {
      setPercent(0);
      const base: SpeakingSubmissionInput = {
        kind: kindOf(context),
        duration_sec: clip.durationSec,
        audio: clip.blob,
        ...(context.type === 'mini'
          ? { sub_module_id: context.subModuleId }
          : { attempt_id: context.attemptId, question_id: context.questionId }),
      };
      return aiApi.createSpeaking(base, { onProgress: setPercent });
    },
    onSuccess: (res) => {
      setError(null);
      qc.setQueryData(submissionKey(res.submission.id), res.submission);
      qc.setQueryData(AI_STATUS_KEY, (old: unknown) => (old ? { ...(old as object), quota: res.quota } : old));
      writeActive(aKey, res.submission.id);
      setSubmissionId(res.submission.id);
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'RECORDING_CONSENT_REQUIRED') {
        void qc.invalidateQueries({ queryKey: ['me'] });
      }
      setError(submitErrorMessage(e, status.data?.quota.limit));
    },
  });

  function newRecording() {
    writeActive(aKey, null);
    setSubmissionId(null);
    setError(null);
    setSession((n) => n + 1);
    notified.current = null;
  }

  const consented = me.data?.consent_recording_at != null;
  const quota = status.data?.quota ?? null;
  const quotaBlocked = !!quota && quota.limit > 0 && quota.remaining <= 0;
  const prep = prepSeconds ?? (context.type === 'attempt' && context.part === 2 ? 60 : 0);
  const rec = recordSeconds ?? 120;

  if (submission) {
    const graded = submission.status === 'GRADED';
    return (
      <div className="grid gap-4" data-testid="speaking-task">
        <div role="region" aria-label={id.ai.writing.resultRegion} className="grid gap-4">
          <SubmissionOutcome
            submission={submission}
            estimatedWaitSec={status.data?.queue.estimated_wait_sec ?? null}
            onReRecord={newRecording}
            extra={<RecordingControls submission={submission} />}
          />
          <div className="flex flex-wrap gap-3">
            {context.type === 'mini' && graded ? (
              <Button variant="outline" onClick={newRecording}>
                <Mic aria-hidden="true" />
                {id.ai.speaking.newRecording}
              </Button>
            ) : null}
            {graded ? (
              <Button asChild variant="ghost">
                <Link href={`/riwayat/penilaian/${submission.id}`}>
                  <History aria-hidden="true" />
                  {id.ai.history.viewHistory}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4" data-testid="speaking-task">
      {status.data && status.data.enabled && !status.data.available ? (
        <p role="status" className="flex items-start gap-2 rounded-md border border-[var(--color-info)] bg-[var(--color-info)]/10 p-3 text-sm" data-testid="ai-unavailable-banner">
          <Info className="mt-0.5 size-4 shrink-0 text-[var(--color-info)]" aria-hidden="true" />
          {id.ai.unavailableBanner}
        </p>
      ) : null}

      {!secure || !supported || consented ? (
        <>
          <SpeakingRecorder
            key={session}
            prompt={prompt}
            cuePoints={cuePoints}
            prepSeconds={prep}
            recordSeconds={rec}
            uploading={create.isPending}
            uploadPercent={percent}
            error={error}
            blockedNote={quotaBlocked ? (quota?.resets_at ? fmt(id.ai.quotaReached, { time: formatTimeWib(quota.resets_at) }) : id.ai.quotaReachedNoTime) : null}
            onSubmit={(clip) => create.mutate(clip)}
          />
        </>
      ) : (
        <div className="grid gap-4 rounded-xl border bg-card p-4 sm:p-6" data-testid="consent-gate">
          <h2 className="text-xl font-bold">{id.ai.speaking.title}</h2>
          <p lang="en" className="whitespace-pre-wrap break-words rounded-lg border bg-muted p-4 text-base leading-7">
            {prompt}
          </p>
          <Button size="lg" className="w-full sm:w-fit" disabled={me.isPending} onClick={() => setConsentOpen(true)}>
            <Mic aria-hidden="true" />
            {id.ai.speaking.startRecord}
          </Button>
        </div>
      )}

      <ConsentDialog
        open={consentOpen}
        retentionDays={status.data?.recording_retention_days ?? null}
        pending={consent.isPending}
        error={consentError}
        onAccept={() => consent.mutate()}
        onCancel={() => setConsentOpen(false)}
      />
    </div>
  );
}
