import type { ScriptItem } from './script-parser';

export interface DurationOptions {
  initialSilenceMs?: number; // Default 1000 ms
  finalSilenceMs?: number; // Default 1500 ms
  sameSpeakerGapMs?: number; // Default 300 ms
  differentSpeakerGapMs?: number; // Default 600 ms
}

export const DEFAULT_DURATION_OPTIONS: Required<DurationOptions> = {
  initialSilenceMs: 1000,
  finalSilenceMs: 1500,
  sameSpeakerGapMs: 300,
  differentSpeakerGapMs: 600,
};

/**
 * Hitung kata dalam teks (token dipisah spasi yang mengandung huruf atau angka).
 */
export function countWords(text: string): number {
  const tokens = text.trim().split(/\s+/);
  return tokens.filter((t) => /[a-zA-Z0-9]/.test(t)).length;
}

/**
 * Hitung planned_ms (SPEC-024 D5).
 * planned_ms = sum(segment_ms) + sum(jeda eksplisit) + jeda implisit antarpembicara + hening awal/akhir.
 */
export function computePlannedMs(
  items: ScriptItem[],
  segmentMsList: number[],
  options: DurationOptions = {},
): number {
  const opts = { ...DEFAULT_DURATION_OPTIONS, ...options };
  let planned = opts.initialSilenceMs + opts.finalSilenceMs;

  let prevSpeaker: string | null = null;
  let uttIdx = 0;

  for (const item of items) {
    if (item.kind === 'PAUSE') {
      planned += Math.round(item.durationSec * 1000);
      // Jeda eksplisit mereset jeda implisit berikutnya atau jeda implisit tetap berlaku setelah jeda?
      // Sesuai D5: "jumlah jeda eksplisit + jeda implisit antara dua ujaran berurutan"
      // Jadi jeda implisit dievaluasi antara dua ujaran berurutan.
    } else if (item.kind === 'UTTERANCE') {
      const segMs = segmentMsList[uttIdx++] ?? 0;
      planned += segMs;

      if (prevSpeaker !== null) {
        if (prevSpeaker === item.speaker) {
          planned += opts.sameSpeakerGapMs;
        } else {
          planned += opts.differentSpeakerGapMs;
        }
      }
      prevSpeaker = item.speaker;
    }
  }

  return planned;
}

/**
 * Estimasi durasi skrip (sebelum sintesis audio) berdasarkan jumlah kata dan kecepatan.
 * Formula: jumlah_kata / (2.5 * kecepatan) detik per ujaran + jeda.
 */
export function estimateDurationMs(
  items: ScriptItem[],
  speedMap: Record<string, number>,
  options: DurationOptions = {},
): number {
  const opts = { ...DEFAULT_DURATION_OPTIONS, ...options };
  let estimated = opts.initialSilenceMs + opts.finalSilenceMs;

  let prevSpeaker: string | null = null;

  for (const item of items) {
    if (item.kind === 'PAUSE') {
      estimated += Math.round(item.durationSec * 1000);
    } else if (item.kind === 'UTTERANCE') {
      const words = countWords(item.text);
      const spd = speedMap[item.speaker] ?? 1.0;
      const uttSec = words / (2.5 * spd);
      estimated += Math.round(uttSec * 1000);

      if (prevSpeaker !== null) {
        if (prevSpeaker === item.speaker) {
          estimated += opts.sameSpeakerGapMs;
        } else {
          estimated += opts.differentSpeakerGapMs;
        }
      }
      prevSpeaker = item.speaker;
    }
  }

  return estimated;
}

export interface AntiClipResult {
  valid: boolean;
  minDurationSec: number;
  maxDurationSec: number;
  wordCount: number;
  reason?: string;
}

/**
 * Validasi anti-klip (SPEC-024 D5).
 * Tiap segmen harus berdurasi antara 0.12 * kata dan 1.5 * kata detik,
 * serta volume rata-rata > -50 dB.
 */
export function verifyAntiClip(
  text: string,
  durationSec: number,
  volumeDb?: number,
): AntiClipResult {
  const words = Math.max(1, countWords(text));
  const minDur = 0.12 * words;
  const maxDur = 1.5 * words;

  if (durationSec < minDur) {
    return {
      valid: false,
      minDurationSec: minDur,
      maxDurationSec: maxDur,
      wordCount: words,
      reason: `Durasi segmen (${durationSec.toFixed(2)}s) lebih pendek dari batas minimal (${minDur.toFixed(2)}s untuk ${words} kata).`,
    };
  }

  if (durationSec > maxDur) {
    return {
      valid: false,
      minDurationSec: minDur,
      maxDurationSec: maxDur,
      wordCount: words,
      reason: `Durasi segmen (${durationSec.toFixed(2)}s) melebihi batas maksimal (${maxDur.toFixed(2)}s untuk ${words} kata).`,
    };
  }

  if (volumeDb !== undefined && volumeDb <= -50) {
    return {
      valid: false,
      minDurationSec: minDur,
      maxDurationSec: maxDur,
      wordCount: words,
      reason: `Volume rata-rata (${volumeDb.toFixed(1)} dB) terlalu rendah (<= -50 dB).`,
    };
  }

  return {
    valid: true,
    minDurationSec: minDur,
    maxDurationSec: maxDur,
    wordCount: words,
  };
}

/**
 * Periksa batas toleransi 5% antara measured_ms dan planned_ms.
 * Lulus bila abs(measured_ms - planned_ms) / planned_ms <= 0.05.
 */
export function isWithinDurationTolerance(measuredMs: number, plannedMs: number): boolean {
  if (plannedMs <= 0) return false;
  const diff = Math.abs(measuredMs - plannedMs);
  return diff / plannedMs <= 0.05;
}
