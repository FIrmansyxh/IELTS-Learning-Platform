'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { id } from '@/i18n';
import { RecordingConsentDialog } from './recording-consent-dialog';
import type { SubmissionDTO } from '@/contracts/ai';

export interface SpeakingRecorderProps {
  kind: 'SPEAKING_PART1' | 'SPEAKING_PART2' | 'SPEAKING_PART3' | 'MINI_TASK_SPEAKING';
  attemptId?: string | null;
  questionId?: string | null;
  subModuleId?: string | null;
  promptText: string;
  cuePoints?: string[];
  prepSeconds?: number;
  recordSeconds?: number;
  hasConsented?: boolean;
  retentionDays?: number;
  onSubmissionCreated?: (submission: SubmissionDTO) => void;
}

type Phase = 'PREP' | 'COUNTDOWN_321' | 'RECORDING' | 'REVIEW';

export function SpeakingRecorder({
  kind,
  attemptId,
  questionId,
  subModuleId,
  promptText,
  cuePoints,
  prepSeconds = 60,
  recordSeconds = 120,
  hasConsented = true,
  retentionDays = 90,
  onSubmissionCreated,
}: SpeakingRecorderProps) {
  const [phase, setPhase] = useState<Phase>('PREP');
  const [consentOpen, setConsentOpen] = useState(!hasConsented);
  const [micGranted, setMicGranted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [isSecure, setIsSecure] = useState(true);

  // Timers and counters
  const [prepRemaining, setPrepRemaining] = useState(prepSeconds);
  const [recordRemaining, setRecordRemaining] = useState(recordSeconds);
  const [countdown321, setCountdown321] = useState(3);
  const [remainingAttempts, setRemainingAttempts] = useState(3);

  // Scratch notes for learner
  const [scratchNotes, setScratchNotes] = useState('');

  // Audio level meter (0 to 10)
  const [audioLevel, setAudioLevel] = useState(0);
  const [isTooQuiet, setIsTooQuiet] = useState(false);

  // Recording state & result
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [recordedDurationSec, setRecordedDurationSec] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Refs for audio hardware
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartTimeRef = useRef<number>(0);
  const quietSecondsCountRef = useRef<number>(0);

  // Check secure context
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setIsSecure(false);
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {});
      }
    };
  }, [blobUrl]);

  // Request Microphone and initialize AudioContext
  const requestMic = useCallback(async () => {
    setMicError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia tidak didukung oleh browser ini.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicGranted(true);

      // Setup Web Audio Analyser for sound meter
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
    } catch (err: unknown) {
      setMicError(
        err instanceof Error ? err.message : id.speaking.micPermissionDenied
      );
    }
  }, []);

  // Monitor sound level meter
  useEffect(() => {
    if (!analyserRef.current || (phase !== 'PREP' && phase !== 'RECORDING')) {
      return;
    }

    let animId: number;
    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      // Map 0-255 to 0-10 level
      const level = Math.min(10, Math.round((avg / 128) * 10));
      setAudioLevel(level);

      animId = requestAnimationFrame(checkVolume);
    };

    animId = requestAnimationFrame(checkVolume);
    return () => cancelAnimationFrame(animId);
  }, [phase, micGranted]);

  // Prep timer
  useEffect(() => {
    if (phase !== 'PREP') return;
    if (prepRemaining <= 0) {
      setPhase('COUNTDOWN_321');
      return;
    }
    const timer = setInterval(() => {
      setPrepRemaining((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, prepRemaining]);

  // Stop recording helper
  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Countdown 3-2-1 timer
  useEffect(() => {
    if (phase !== 'COUNTDOWN_321') return;
    if (countdown321 <= 1) {
      setCountdown321(3);
      setPhase('RECORDING');
      return;
    }
    const timer = setTimeout(() => {
      setCountdown321((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown321]);

  // Determine best mime type
  const getSupportedMimeType = useCallback(() => {
    if (typeof MediaRecorder === 'undefined') return 'audio/webm';
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return '';
  }, []);

  // When phase becomes RECORDING, start MediaRecorder
  useEffect(() => {
    if (phase !== 'RECORDING') return;
    if (!streamRef.current) return;

    chunksRef.current = [];
    const mimeType = getSupportedMimeType();
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};

    try {
      const recorder = new MediaRecorder(streamRef.current, options);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const mime = mimeType.split(';')[0] || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        const durSec = Math.round((Date.now() - recordStartTimeRef.current) / 1000);
        setRecordedBlob(blob);
        setRecordedDurationSec(durSec);
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setPhase('REVIEW');
      };

      mediaRecorderRef.current = recorder;
      recordStartTimeRef.current = Date.now();
      recorder.start(250); // collect chunks every 250ms
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : 'Gagal memulai perekaman audio.'
      );
    }
  }, [phase, getSupportedMimeType]);

  // Recording countdown timer & quiet monitoring
  useEffect(() => {
    if (phase !== 'RECORDING') return;

    if (recordRemaining <= 0) {
      stopRecording();
      return;
    }

    const timer = setInterval(() => {
      setRecordRemaining((prev) => prev - 1);

      // Check quiet level for 3 consecutive seconds
      if (audioLevel < 2) {
        quietSecondsCountRef.current += 1;
        if (quietSecondsCountRef.current >= 3) {
          setIsTooQuiet(true);
        }
      } else {
        quietSecondsCountRef.current = 0;
        setIsTooQuiet(false);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, recordRemaining, audioLevel, stopRecording]);

  const handleStartPrepEarly = () => {
    setPhase('COUNTDOWN_321');
  };

  const handleReRecord = () => {
    if (remainingAttempts <= 1) return;
    setRemainingAttempts((prev) => prev - 1);
    setRecordedBlob(null);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    setRecordRemaining(recordSeconds);
    setPrepRemaining(prepSeconds);
    setPhase('PREP');
  };

  const handleSubmit = async () => {
    if (!recordedBlob) return;
    if (recordedDurationSec < 3) {
      setSubmitError(id.speaking.recordingTooShort);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const formData = new FormData();
      formData.append('kind', kind);
      if (attemptId) formData.append('attempt_id', attemptId);
      if (questionId) formData.append('question_id', questionId);
      if (subModuleId) formData.append('sub_module_id', subModuleId);
      formData.append('duration_sec', recordedDurationSec.toString());

      // File extension matching mime
      let ext = 'webm';
      if (recordedBlob.type.includes('ogg')) ext = 'ogg';
      else if (recordedBlob.type.includes('mp4')) ext = 'm4a';

      formData.append(
        'audio',
        new File([recordedBlob], `answer.${ext}`, { type: recordedBlob.type })
      );

      const res = await fetch('/api/v1/submissions/speaking', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string; details?: Array<{ message: string }> };
        };
        const message =
          data.error?.details?.[0]?.message ||
          data.error?.message ||
          'Gagal mengirim rekaman.';
        throw new Error(message);
      }

      const body = (await res.json()) as { data: { submission: SubmissionDTO } };
      onSubmissionCreated?.(body.data.submission);
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat mengunggah.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Guard: Insecure context
  if (!isSecure) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-destructive text-center">
        <p className="font-semibold">{id.speaking.insecureContextNotice}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
      {/* Consent Dialog */}
      <RecordingConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onConsentSuccess={() => setConsentOpen(false)}
        retentionDays={retentionDays}
      />

      {/* Permission Check / Pre-Check */}
      {!micGranted && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {id.speaking.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Izinkan akses mikrofon untuk mulai merekam jawaban latihan Anda.
            </p>
          </div>

          {micError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive text-left max-w-md">
              <p className="font-semibold">{id.speaking.micPermissionDenied}</p>
              <p className="mt-1 text-[11px] leading-relaxed">
                {id.speaking.enableMicInstructions}
              </p>
            </div>
          )}

          <Button type="button" onClick={requestMic} className="mt-2">
            Izinkan Mikrofon
          </Button>
        </div>
      )}

      {/* Main Recorder Content once mic is granted */}
      {micGranted && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs flex flex-col gap-6">
          {/* Stepper Header */}
          <div className="flex items-center justify-between border-b border-border/60 pb-4 text-xs font-medium">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  phase === 'PREP'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                1
              </span>
              <span className={phase === 'PREP' ? 'text-foreground font-semibold' : 'text-muted-foreground'}>
                {id.speaking.prepPhase}
              </span>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  phase === 'RECORDING' || phase === 'COUNTDOWN_321'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                2
              </span>
              <span className={phase === 'RECORDING' || phase === 'COUNTDOWN_321' ? 'text-foreground font-semibold' : 'text-muted-foreground'}>
                {id.speaking.recordingPhase}
              </span>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  phase === 'REVIEW'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                3
              </span>
              <span className={phase === 'REVIEW' ? 'text-foreground font-semibold' : 'text-muted-foreground'}>
                {id.speaking.reviewPhase}
              </span>
            </div>
          </div>

          {/* Sound Level Meter (Active during PREP & RECORDING) */}
          {(phase === 'PREP' || phase === 'RECORDING') && (
            <div className="flex flex-col items-center gap-1.5 py-1">
              <div
                className="flex items-end gap-1 h-6"
                role="progressbar"
                aria-label={id.speaking.soundLevel}
                aria-valuenow={audioLevel}
                aria-valuemin={0}
                aria-valuemax={10}
              >
                {[...Array(10)].map((_, i) => {
                  const isActive = i < audioLevel;
                  const heights = [
                    'h-1.5',
                    'h-2',
                    'h-2.5',
                    'h-3',
                    'h-3.5',
                    'h-4',
                    'h-4.5',
                    'h-5',
                    'h-5.5',
                    'h-6',
                  ];
                  return (
                    <div
                      key={i}
                      className={`w-1.5 rounded-full transition-all duration-75 ${
                        heights[i]
                      } ${
                        isActive
                          ? i >= 8
                            ? 'bg-red-500'
                            : i >= 5
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                          : 'bg-muted/40'
                      }`}
                    />
                  );
                })}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {id.speaking.soundLevel}
              </span>
              {isTooQuiet && phase === 'RECORDING' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium animate-pulse mt-1">
                  ⚠️ {id.speaking.tooQuietNotice}
                </p>
              )}
            </div>
          )}

          {/* PHASE 1: PREPARATION */}
          {phase === 'PREP' && (
            <div className="flex flex-col gap-5">
              {/* Prompt Card */}
              <div className="rounded-lg border border-border/80 bg-muted/20 p-5 flex flex-col gap-3">
                <h4 className="text-sm font-semibold text-foreground">
                  Topik Soal
                </h4>
                <p className="text-sm text-foreground/90 leading-relaxed font-serif">
                  {promptText}
                </p>
                {cuePoints && cuePoints.length > 0 && (
                  <div className="mt-2 pt-3 border-t border-border/60">
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                      Poin-poin yang perlu Anda sampaikan:
                    </p>
                    <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                      {cuePoints.map((point, idx) => (
                        <li key={idx}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Local Scratch Notes */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="scratch-notes"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Catatan Persiapan (Hanya untuk latihan Anda, tidak dikirim)
                </label>
                <textarea
                  id="scratch-notes"
                  rows={4}
                  value={scratchNotes}
                  onChange={(e) => setScratchNotes(e.target.value)}
                  placeholder="Ketik poin penting yang ingin Anda sampaikan..."
                  className="w-full rounded-md border border-input bg-background p-3 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {/* Countdown & Action */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {id.speaking.prepCountdown.replace(
                      '{sec}',
                      prepRemaining.toString()
                    )}
                  </span>
                </div>
                <Button type="button" onClick={handleStartPrepEarly}>
                  {id.speaking.startRecordingNow}
                </Button>
              </div>
            </div>
          )}

          {/* COUNTDOWN 3-2-1 OVERLAY */}
          {phase === 'COUNTDOWN_321' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <span className="text-6xl font-black text-primary animate-ping">
                {countdown321}
              </span>
              <p className="text-xs font-medium text-muted-foreground">
                Bersiaplah untuk berbicara...
              </p>
            </div>
          )}

          {/* PHASE 2: RECORDING */}
          {phase === 'RECORDING' && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              {/* Giant Recording Button (72px) */}
              <div className="relative flex items-center justify-center">
                <button
                  type="button"
                  onClick={stopRecording}
                  aria-label={id.speaking.stopRecording}
                  className="w-[72px] h-[72px] rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg hover:bg-destructive/90 transition-transform active:scale-95 focus:outline-none focus:ring-4 focus:ring-destructive/30"
                >
                  {/* Square icon for stop */}
                  <div className="w-6 h-6 rounded-xs bg-white" />
                </button>
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-destructive" />
                </span>
              </div>

              {/* Timer Display */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-foreground">
                  {Math.floor(recordRemaining / 60)}:
                  {(recordRemaining % 60).toString().padStart(2, '0')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {id.speaking.recordCountdown.replace(
                    '{sec}',
                    recordRemaining.toString()
                  )}
                </span>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={stopRecording}
              >
                {id.speaking.stopRecording}
              </Button>
            </div>
          )}

          {/* PHASE 3: REVIEW & SUBMIT */}
          {phase === 'REVIEW' && (
            <div className="flex flex-col gap-6">
              <div className="rounded-lg border border-border/80 bg-muted/20 p-5 flex flex-col items-center gap-4">
                <h4 className="text-sm font-semibold text-foreground">
                  {id.speaking.reviewPhase}
                </h4>

                {blobUrl && (
                  <audio
                    controls
                    src={blobUrl}
                    className="w-full max-w-md h-12 rounded"
                    aria-label={id.speaking.playRecording}
                  />
                )}

                <p className="text-xs text-muted-foreground">
                  Durasi rekaman: {recordedDurationSec} detik
                </p>
              </div>

              {submitError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {submitError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReRecord}
                  disabled={remainingAttempts <= 1 || isSubmitting}
                >
                  {id.speaking.reRecord.replace(
                    '{remaining}',
                    (remainingAttempts - 1).toString()
                  )}
                </Button>

                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Mengirim...' : id.speaking.submitBtn}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
