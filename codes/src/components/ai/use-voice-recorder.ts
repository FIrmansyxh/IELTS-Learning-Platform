'use client';

import * as React from 'react';
import { MAX_UPLOAD_BYTES, micErrorKind, pickRecorderMime, rmsLevel } from '@/lib/ai/recorder';

export type MicState = 'idle' | 'requesting' | 'ready' | 'denied' | 'notfound' | 'error';

export type RecordedClip = { blob: Blob; durationSec: number; mime: string };

/** Dukungan dasar perekaman di peramban ini (dievaluasi di klien saat dipanggil). */
export function recordingSupport(): { secure: boolean; supported: boolean } {
  if (typeof window === 'undefined') return { secure: true, supported: true };
  const secure = window.isSecureContext;
  const supported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  return { secure, supported };
}

/**
 * Pembungkus `getUserMedia` + `MediaRecorder` + level suara (AnalyserNode). Tidak ada Web Speech API
 * dan tidak ada jaringan: audio hanya dirakit menjadi Blob di memori, lalu dikirim lewat `aiApi`.
 */
export function useVoiceRecorder() {
  const [mic, setMic] = React.useState<MicState>('idle');
  const [recording, setRecording] = React.useState(false);
  const [level, setLevel] = React.useState(0);
  const [quiet, setQuiet] = React.useState(false);
  const [tooLarge, setTooLarge] = React.useState(false);
  const [recorderError, setRecorderError] = React.useState(false);
  const [autoStopped, setAutoStopped] = React.useState(false);
  const lastClipRef = React.useRef<RecordedClip | null>(null);

  const streamRef = React.useRef<MediaStream | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const bytesRef = React.useRef(0);
  const startedAtRef = React.useRef(0);
  const ctxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const quietMsRef = React.useRef(0);
  const resolveStopRef = React.useRef<((clip: RecordedClip | null) => void) | null>(null);
  const recordingRef = React.useRef(false);

  const stopTick = React.useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  const release = React.useCallback(() => {
    stopTick();
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    } catch {
      /* sudah berhenti */
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    analyserRef.current = null;
    recordingRef.current = false;
    setRecording(false);
    setLevel(0);
  }, [stopTick]);

  React.useEffect(() => release, [release]);

  const startTick = React.useCallback(() => {
    stopTick();
    const buf = new Uint8Array(analyserRef.current?.fftSize ?? 1024);
    tickRef.current = setInterval(() => {
      const an = analyserRef.current;
      if (!an) return;
      an.getByteTimeDomainData(buf);
      const l = rmsLevel(buf);
      setLevel(l);
      if (recordingRef.current) {
        quietMsRef.current = l < 0.08 ? quietMsRef.current + 100 : 0;
        setQuiet(quietMsRef.current >= 3000);
      }
    }, 100);
  }, [stopTick]);

  /** Minta izin mikrofon dan mulai menampilkan level suara. */
  const requestMic = React.useCallback(async (): Promise<boolean> => {
    release();
    setMic('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AC: typeof AudioContext | undefined =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        try {
          const ctx = new AC();
          const an = ctx.createAnalyser();
          an.fftSize = 1024;
          ctx.createMediaStreamSource(stream).connect(an);
          ctxRef.current = ctx;
          analyserRef.current = an;
          startTick();
        } catch {
          /* tanpa level meter; perekaman tetap bisa */
        }
      }
      setMic('ready');
      return true;
    } catch (e) {
      const kind = micErrorKind(e);
      setMic(kind === 'denied' ? 'denied' : kind === 'notfound' ? 'notfound' : 'error');
      return false;
    }
  }, [release, startTick]);

  const start = React.useCallback((): boolean => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') return false;
    const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
    try {
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      bytesRef.current = 0;
      quietMsRef.current = 0;
      setQuiet(false);
      setTooLarge(false);
      setRecorderError(false);
      setAutoStopped(false);
      lastClipRef.current = null;
      rec.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
          bytesRef.current += ev.data.size;
          if (bytesRef.current > MAX_UPLOAD_BYTES) {
            setTooLarge(true);
            if (rec.state !== 'inactive') rec.stop();
          }
        }
      };
      rec.onerror = () => setRecorderError(true);
      rec.onstop = () => {
        const durationSec = (Date.now() - startedAtRef.current) / 1000;
        const type = (rec.mimeType || mime || 'audio/webm').split(';')[0] ?? 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        recordingRef.current = false;
        setRecording(false);
        const clip = blob.size > 0 ? { blob, durationSec, mime: type } : null;
        lastClipRef.current = clip;
        if (resolveStopRef.current) {
          resolveStopRef.current(clip);
          resolveStopRef.current = null;
        } else {
          // Berhenti sendiri (melebihi 10 MB): komponen mengambil klip lewat stop().
          setAutoStopped(true);
        }
      };
      startedAtRef.current = Date.now();
      rec.start(1000);
      recorderRef.current = rec;
      recordingRef.current = true;
      setRecording(true);
      return true;
    } catch {
      setRecorderError(true);
      return false;
    }
  }, []);

  /** Berhenti dan kembalikan klip; null bila kosong/gagal. */
  const stop = React.useCallback((): Promise<RecordedClip | null> => {
    const rec = recorderRef.current;
    if (!rec) return Promise.resolve(lastClipRef.current);
    if (rec.state === 'inactive') return Promise.resolve(lastClipRef.current);
    return new Promise((resolve) => {
      resolveStopRef.current = resolve;
      rec.stop();
    });
  }, []);

  return { mic, recording, level, quiet, tooLarge, recorderError, autoStopped, requestMic, start, stop, release };
}
