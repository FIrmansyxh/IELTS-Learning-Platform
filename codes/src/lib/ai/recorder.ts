export const RECORDER_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MIN_RECORD_SEC = 3;
export const MAX_RERECORDS = 3;
export const LEVEL_SEGMENTS = 10;
export const QUIET_LEVEL = 0.08;
export const QUIET_SECONDS = 3;

/** MIME pertama yang didukung `MediaRecorder.isTypeSupported`; null bila tidak ada. */
export function pickRecorderMime(isSupported: (m: string) => boolean): string | null {
  return RECORDER_MIME_CANDIDATES.find((m) => isSupported(m)) ?? null;
}

/** RMS 0..1 dari sampel domain waktu `AnalyserNode.getByteTimeDomainData` (128 = hening). */
export function rmsLevel(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = ((samples[i] ?? 128) - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 3);
}

/** Jumlah segmen menyala (0..10) dari level 0..1. */
export function litSegments(level: number): number {
  return Math.max(0, Math.min(LEVEL_SEGMENTS, Math.round(level * LEVEL_SEGMENTS)));
}

export function micErrorKind(e: unknown): 'denied' | 'notfound' | 'other' {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'notfound';
  return 'other';
}
