'use client';

import { Mic, MicOff, RotateCcw, Send, ShieldAlert, Square } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { fmt, id } from '@/i18n/id';
import { MAX_RERECORDS, MAX_UPLOAD_BYTES, MIN_RECORD_SEC } from '@/lib/ai/recorder';
import { formatClock } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LevelMeter } from './level-meter';
import { recordingSupport, useVoiceRecorder, type RecordedClip } from './use-voice-recorder';

type Phase = 'precheck' | 'prep' | 'countdown' | 'recording' | 'review';
const STEP_OF: Record<Phase, number> = { precheck: 0, prep: 0, countdown: 1, recording: 1, review: 2 };

/** Hitung mundur berbasis tenggat (tahan terhadap tab yang di-throttle). */
function useCountdown(totalSec: number, active: boolean, onDone: () => void): number {
  const [left, setLeft] = React.useState(totalSec);
  const doneRef = React.useRef(onDone);
  doneRef.current = onDone;
  React.useEffect(() => {
    setLeft(totalSec);
    if (!active || totalSec <= 0) return;
    const deadline = Date.now() + totalSec * 1000;
    const t = setInterval(() => {
      const rem = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(rem);
      if (rem <= 0) {
        clearInterval(t);
        doneRef.current();
      }
    }, 250);
    return () => clearInterval(t);
  }, [totalSec, active]);
  return left;
}

function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div role="alert" className="grid gap-3 rounded-xl border border-[var(--color-warning)] bg-card p-4 sm:p-6" data-testid="mic-notice">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-[var(--color-accent-text)]" aria-hidden="true" />
        <div className="grid gap-1">
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Stepper({ phase }: { phase: Phase }) {
  const names = [id.ai.speaking.steps.prep, id.ai.speaking.steps.record, id.ai.speaking.steps.review];
  const cur = STEP_OF[phase];
  return (
    <ol aria-label={id.ai.speaking.stepper} className="flex items-center gap-2 text-sm" data-testid="speaking-stepper">
      {names.map((n, i) => (
        <li
          key={n}
          aria-current={i === cur ? 'step' : undefined}
          className={cn('flex items-center gap-2', i === cur ? 'font-semibold' : 'text-muted-foreground')}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex size-6 items-center justify-center rounded-full border text-xs tabular-nums',
              i === cur ? 'border-primary bg-primary text-primary-foreground' : i < cur ? 'border-primary text-primary' : 'border-border',
            )}
          >
            {i + 1}
          </span>
          <span className={cn(i === cur ? '' : 'hidden sm:inline')}>{n}</span>
          {i < names.length - 1 ? <span aria-hidden="true" className="h-px w-4 bg-border sm:w-8" /> : null}
        </li>
      ))}
    </ol>
  );
}

export type SpeakingRecorderProps = {
  prompt: string;
  cuePoints?: string[];
  prepSeconds: number;
  recordSeconds: number;
  uploading: boolean;
  uploadPercent: number;
  error?: string | null;
  /** Alasan pengiriman diblokir (mis. kuota harian habis). */
  blockedNote?: string | null;
  onSubmit: (clip: RecordedClip) => void;
};

/** Perekam Speaking tiga fase: Persiapan -> Rekam -> Tinjau & Kirim (SPEC-013). */
export function SpeakingRecorder({ prompt, cuePoints = [], prepSeconds, recordSeconds, uploading, uploadPercent, error, blockedNote, onSubmit }: SpeakingRecorderProps) {
  const rec = useVoiceRecorder();
  const [phase, setPhase] = React.useState<Phase>('precheck');
  const [clip, setClip] = React.useState<RecordedClip | null>(null);
  const [used, setUsed] = React.useState(0);
  const [notes, setNotes] = React.useState('');
  const [localErr, setLocalErr] = React.useState<string | null>(null);
  const [{ secure, supported }] = React.useState(recordingSupport);

  const clipUrl = React.useMemo(() => (clip ? URL.createObjectURL(clip.blob) : null), [clip]);
  React.useEffect(() => {
    return () => {
      if (clipUrl) URL.revokeObjectURL(clipUrl);
    };
  }, [clipUrl]);

  /* ---------- persiapan ---------- */
  const goCountdown = React.useCallback(() => setPhase('countdown'), []);
  const prepLeft = useCountdown(prepSeconds, phase === 'prep', goCountdown);

  /* ---------- hitung mundur 3-2-1 ---------- */
  const beginRecording = React.useCallback(() => {
    if (rec.start()) setPhase('recording');
    else setLocalErr(id.ai.speaking.recorderError);
  }, [rec]);
  const cdLeft = useCountdown(3, phase === 'countdown', beginRecording);

  /* ---------- rekam ---------- */
  const finish = React.useCallback(async () => {
    const c = await rec.stop();
    if (!c) {
      setLocalErr(id.ai.speaking.recorderError);
      setPhase('review');
      setClip(null);
      rec.release();
      return;
    }
    setClip(c);
    setPhase('review');
    // Matikan mikrofon selama tinjauan (indikator peramban padam).
    rec.release();
  }, [rec]);
  const recLeft = useCountdown(recordSeconds, phase === 'recording', () => void finish());

  // Berhenti sendiri (melebihi 10 MB).
  React.useEffect(() => {
    if (rec.autoStopped && phase === 'recording') void finish();
  }, [rec.autoStopped, phase, finish]);

  async function reRecord() {
    setClip(null);
    setLocalErr(null);
    setUsed((n) => n + 1);
    const ok = await rec.requestMic();
    setPhase(ok ? 'prep' : 'precheck');
  }

  /* ---------- tampilan ---------- */
  if (!secure) return <Notice title={id.ai.speaking.insecureTitle} body={id.ai.speaking.insecureBody} />;
  if (!supported) return <Notice title={id.ai.speaking.unsupportedTitle} body={id.ai.speaking.unsupportedBody} />;

  const phaseName = [id.ai.speaking.steps.prep, id.ai.speaking.steps.record, id.ai.speaking.steps.review][STEP_OF[phase]] ?? '';
  const left = MAX_RERECORDS - used;
  const tooShort = clip !== null && clip.durationSec < MIN_RECORD_SEC;
  const tooBig = clip !== null && clip.blob.size > MAX_UPLOAD_BYTES;
  const canSend = clip !== null && !tooShort && !tooBig && !uploading && !blockedNote;
  const shownErr = error ?? localErr;

  const cueCard = (
    <section aria-label={id.ai.speaking.cueCard} className="grid gap-2 rounded-lg border bg-muted p-4" data-testid="cue-card">
      <h3 className="text-base font-semibold">{id.ai.speaking.cueCard}</h3>
      <p lang="en" className="whitespace-pre-wrap break-words text-base leading-7">
        {prompt}
      </p>
      {cuePoints.length > 0 ? (
        <>
          <p className="text-sm font-medium">{id.ai.speaking.cuePoints}</p>
          <ul lang="en" className="grid list-disc gap-0.5 pl-5">
            {cuePoints.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );

  return (
    <div className="grid gap-5 rounded-xl border bg-card p-4 sm:p-6" data-testid="speaking-recorder" data-phase={phase}>
      <h2 className="text-xl font-bold">{id.ai.speaking.title}</h2>
      <Stepper phase={phase} />
      <p className="sr-only" role="status" aria-live="polite">
        {fmt(id.ai.speaking.phaseAnnounce, { name: phaseName })}
      </p>

      {phase === 'precheck' ? (
        <div className="grid gap-4">
          {rec.mic === 'denied' ? (
            <Notice title={id.ai.speaking.deniedTitle} body={id.ai.speaking.deniedBody}>
              <Button variant="outline" className="w-fit" onClick={() => void rec.requestMic()}>
                {id.ai.speaking.tryAgain}
              </Button>
            </Notice>
          ) : rec.mic === 'notfound' ? (
            <Notice title={id.ai.speaking.notFoundTitle} body={id.ai.speaking.notFoundBody}>
              <Button variant="outline" className="w-fit" onClick={() => void rec.requestMic()}>
                {id.ai.speaking.tryAgain}
              </Button>
            </Notice>
          ) : rec.mic === 'error' ? (
            <Notice title={id.ai.speaking.micOtherTitle} body={id.ai.speaking.notFoundBody}>
              <Button variant="outline" className="w-fit" onClick={() => void rec.requestMic()}>
                {id.ai.speaking.tryAgain}
              </Button>
            </Notice>
          ) : rec.mic === 'ready' ? (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">{id.ai.speaking.testLevel}</p>
              <LevelMeter level={rec.level} />
              <Button size="lg" className="w-full sm:w-fit" onClick={() => setPhase('prep')}>
                {id.ai.speaking.continue}
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              <h3 className="font-semibold">{id.ai.speaking.precheckTitle}</h3>
              <p className="text-sm text-muted-foreground">{id.ai.speaking.precheckBody}</p>
              <Button size="lg" className="w-full sm:w-fit" loading={rec.mic === 'requesting'} onClick={() => void rec.requestMic()}>
                <Mic aria-hidden="true" />
                {rec.mic === 'requesting' ? id.ai.speaking.requesting : id.ai.speaking.allowMic}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {phase === 'prep' ? (
        <div className="grid gap-4">
          {cueCard}
          <div className="grid gap-2">
            <label htmlFor="speaking-notes" className="text-sm font-medium">
              {id.ai.speaking.notes}
            </label>
            <textarea
              id="speaking-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={id.ai.speaking.notesPlaceholder}
              spellCheck={false}
              lang="en"
              className="min-h-24 w-full resize-y rounded-md border border-input bg-transparent p-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {prepSeconds > 0 ? (
              <p className="font-heading text-3xl font-bold tabular-nums" data-testid="prep-timer">
                <span className="sr-only">{id.ai.speaking.prepTimer}: </span>
                {formatClock(prepLeft)}
              </p>
            ) : null}
            <Button size="lg" onClick={goCountdown}>
              <Mic aria-hidden="true" />
              {id.ai.speaking.startRecord}
            </Button>
          </div>
        </div>
      ) : null}

      {phase === 'countdown' ? (
        <div className="grid justify-items-center gap-2 py-6" data-testid="countdown">
          <p className="font-heading text-7xl font-bold tabular-nums" aria-hidden="true">
            {Math.max(1, cdLeft)}
          </p>
          <p role="status" aria-live="assertive" className="text-sm text-muted-foreground">
            {fmt(id.ai.speaking.countdown, { n: Math.max(1, cdLeft) })}
          </p>
        </div>
      ) : null}

      {phase === 'recording' ? (
        <div className="grid justify-items-center gap-4">
          <div className="w-full">{cueCard}</div>
          <p className="flex items-center gap-2 font-semibold" data-testid="recording-label">
            <span aria-hidden="true" className="size-3 animate-pulse rounded-full bg-[var(--color-error)] motion-reduce:animate-none" />
            {id.ai.speaking.recording}
          </p>
          <p className="font-heading text-4xl font-bold tabular-nums" data-testid="record-timer">
            <span className="sr-only">{id.ai.speaking.recordTimer}: </span>
            {formatClock(recLeft)}
          </p>
          <button
            type="button"
            onClick={() => void finish()}
            aria-label={id.ai.speaking.recordStop}
            className="flex size-[72px] items-center justify-center rounded-full bg-destructive text-white outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Square className="size-8" aria-hidden="true" />
          </button>
          <LevelMeter level={rec.level} />
          <p role="status" aria-live="polite" className="min-h-5 text-sm text-[var(--color-accent-text)]" data-testid="quiet-warning">
            {rec.quiet ? id.ai.speaking.levelQuiet : ''}
          </p>
        </div>
      ) : null}

      {phase === 'review' ? (
        <div className="grid gap-4">
          <h3 className="font-semibold">{id.ai.speaking.reviewTitle}</h3>
          {clipUrl && clip ? (
            <div className="grid gap-2">
              <audio controls src={clipUrl} aria-label={id.ai.speaking.reviewAudio} className="w-full" data-testid="review-audio" />
              <p className="text-sm text-muted-foreground tabular-nums">{fmt(id.ai.speaking.duration, { time: formatClock(clip.durationSec) })}</p>
            </div>
          ) : null}
          {tooShort ? (
            <p role="alert" className="text-sm text-destructive">
              {id.ai.speaking.tooShort}
            </p>
          ) : null}
          {rec.tooLarge || tooBig ? (
            <p role="alert" className="text-sm text-destructive">
              {id.ai.speaking.tooLarge}
            </p>
          ) : null}
          {blockedNote ? (
            <p role="status" className="text-sm text-muted-foreground" data-testid="blocked-note">
              {blockedNote}
            </p>
          ) : null}
          {shownErr ? (
            <p role="alert" data-testid="speaking-error" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {shownErr}
            </p>
          ) : null}
          {uploading ? (
            <div className="grid gap-1" data-testid="upload-progress">
              <Progress value={uploadPercent} aria-label={fmt(id.ai.speaking.uploadPercent, { n: uploadPercent })} />
              <p className="text-sm text-muted-foreground tabular-nums">{fmt(id.ai.speaking.uploadPercent, { n: uploadPercent })}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" disabled={!canSend} loading={uploading} onClick={() => clip && onSubmit(clip)}>
              <Send aria-hidden="true" />
              {uploading ? id.ai.speaking.sending : id.ai.speaking.send}
            </Button>
            <Button variant="outline" size="lg" disabled={left <= 0 || uploading} onClick={() => void reRecord()}>
              <RotateCcw aria-hidden="true" />
              {id.ai.speaking.reRecord}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="rerecord-left">
            {left > 0 ? fmt(id.ai.speaking.reRecordLeft, { n: left, max: MAX_RERECORDS }) : id.ai.speaking.reRecordNone}
          </p>
        </div>
      ) : null}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <MicOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {id.ai.speaking.a11yNote}
      </p>
    </div>
  );
}
