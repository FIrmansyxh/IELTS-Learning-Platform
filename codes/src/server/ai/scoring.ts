/**
 * Aturan skor di kode, bukan di model (SPEC-012 "Aturan Skor", SPEC-013 "Aturan Skor Speaking"). Fungsi murni.
 * `overall_band` dari model diabaikan; hasil akhir = minimum dari rata-rata kriteria dan semua kap yang BERLAKU.
 * Sebuah kap dianggap berlaku (dan menyalakan `score_capped`) hanya bila benar-benar menurunkan skor.
 */
import type { EvaluationFlagsDTO } from '../../contracts/common';
import type { z } from 'zod';
import { roundToHalfBand } from '../band/convert';

export type ScoreFlags = z.infer<typeof EvaluationFlagsDTO>;

export const defaultFlags = (): ScoreFlags => ({
  injection_suspected: false,
  score_capped: false,
  cap_reason: null,
  high_band_capped: false,
  non_english_suspected: false,
  overall_recomputed: false,
  pronunciation_estimated: false,
  low_audio_quality: false,
});

/** Gabungkan flags tersimpan (mungkin `{}` atau sebagian) dengan nilai default. */
export function normalizeFlags(raw: unknown): ScoreFlags {
  const base = defaultFlags();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const bool = (k: keyof ScoreFlags) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : false);
  const reason = r.cap_reason;
  return {
    injection_suspected: bool('injection_suspected'),
    score_capped: bool('score_capped'),
    cap_reason: reason === 'word_count' || reason === 'non_english' || reason === 'duration' ? reason : null,
    high_band_capped: bool('high_band_capped'),
    non_english_suspected: bool('non_english_suspected'),
    overall_recomputed: bool('overall_recomputed'),
    pronunciation_estimated: bool('pronunciation_estimated'),
    low_audio_quality: bool('low_audio_quality'),
  };
}

export function meanBand(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

type CapReason = 'word_count' | 'non_english' | 'duration';
interface Cap {
  value: number;
  reason: CapReason;
}

function applyCaps(recomputed: number, modelOverall: number, caps: Cap[], flags: ScoreFlags): number {
  flags.overall_recomputed = recomputed !== modelOverall;
  const binding = caps.filter((c) => c.value < recomputed);
  let overall = recomputed;
  if (binding.length > 0) {
    const min = Math.min(...binding.map((c) => c.value));
    const atMin = binding.filter((c) => c.value === min);
    overall = min;
    flags.score_capped = true;
    // Seri: non_english menimpa alasan lain (SPEC-012 aturan 3).
    flags.cap_reason = (atMin.find((c) => c.reason === 'non_english') ?? atMin[0]!).reason;
  }
  if (overall >= 8) {
    overall = 7.5;
    flags.high_band_capped = true;
  }
  return overall;
}

const DEFAULT_MIN_WORDS = { WRITING_TASK1: 150, WRITING_TASK2: 250 } as const;

export interface WritingScoreInput {
  criteria: readonly number[];
  modelOverall: number;
  kind: 'WRITING_TASK1' | 'WRITING_TASK2' | 'MINI_TASK_WRITING';
  wordCount: number;
  /** `min_words` soal; null memakai default (Task 1: 150, Task 2: 250). Diabaikan untuk Mini-Task. */
  minWords: number | null;
  nonEnglish: boolean;
  injection: boolean;
}

/** Sinyal struktural injeksi (F-12-01): semua kriteria >= 8.5 pada teks sangat pendek. */
export const STRUCTURAL_MAX_WORDS = { writing: 100, speaking: 80 } as const;
const structuralInjection = (criteria: readonly number[], wordCount: number, maxWords: number): boolean =>
  criteria.length > 0 && criteria.every((c) => c >= 8.5) && wordCount < maxWords;

export function scoreWriting(i: WritingScoreInput): { overall_band: number; flags: ScoreFlags } {
  const flags = defaultFlags();
  flags.injection_suspected = i.injection || structuralInjection(i.criteria, i.wordCount, STRUCTURAL_MAX_WORDS.writing);
  flags.non_english_suspected = i.nonEnglish;
  const recomputed = roundToHalfBand(meanBand(i.criteria));
  const caps: Cap[] = [];
  if (i.kind !== 'MINI_TASK_WRITING') {
    const min = i.minWords ?? DEFAULT_MIN_WORDS[i.kind];
    const r = i.wordCount / min;
    if (r < 0.5) caps.push({ value: 3.5, reason: 'word_count' });
    else if (r < 0.8) caps.push({ value: 5.0, reason: 'word_count' });
    else if (r < 1.0) caps.push({ value: 6.0, reason: 'word_count' });
  }
  if (i.nonEnglish) caps.push({ value: 4.0, reason: 'non_english' });
  return { overall_band: applyCaps(recomputed, i.modelOverall, caps, flags), flags };
}

export interface SpeakingScoreInput {
  criteria: readonly number[];
  modelOverall: number;
  kind: 'SPEAKING_PART1' | 'SPEAKING_PART2' | 'SPEAKING_PART3' | 'MINI_TASK_SPEAKING';
  durationSec: number | null;
  wordCount: number;
  nonEnglish: boolean;
  injection: boolean;
  sttConfidence: number | null;
}

export function scoreSpeaking(i: SpeakingScoreInput): { overall_band: number; flags: ScoreFlags } {
  const flags = defaultFlags();
  flags.injection_suspected = i.injection || structuralInjection(i.criteria, i.wordCount, STRUCTURAL_MAX_WORDS.speaking);
  flags.non_english_suspected = i.nonEnglish;
  flags.pronunciation_estimated = true;
  flags.low_audio_quality = i.sttConfidence !== null && i.sttConfidence < 0.5;
  const recomputed = roundToHalfBand(meanBand(i.criteria));
  const caps: Cap[] = [];
  if ((i.kind === 'SPEAKING_PART2' || i.kind === 'MINI_TASK_SPEAKING') && i.durationSec !== null) {
    if (i.durationSec < 30) caps.push({ value: 4.0, reason: 'duration' });
    else if (i.durationSec < 60) caps.push({ value: 5.5, reason: 'duration' });
  }
  if (i.wordCount < 15) caps.push({ value: 4.0, reason: 'duration' });
  if (i.nonEnglish) caps.push({ value: 4.0, reason: 'non_english' });
  return { overall_band: applyCaps(recomputed, i.modelOverall, caps, flags), flags };
}
