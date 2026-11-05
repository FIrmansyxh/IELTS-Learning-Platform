/**
 * Logika skor, aturan kap durasi/panjang, dan flag Speaking (SPEC-013).
 */
import { roundToHalfBand } from './scoring';
import type { EvaluationFlagsDTO } from '@/contracts/ai';

export interface SpeakingCriteriaScores {
  fluency: number;
  lexical: number;
  grammar: number;
  pronunciation: number;
}

export interface PostProcessSpeakingParams {
  criteria: SpeakingCriteriaScores;
  modelOverallBand?: number;
  wordCount: number;
  durationSec: number;
  kind: string;
  isInjection: boolean;
  isNonEnglish: boolean;
  sttConfidence: number | null;
}

export interface PostProcessSpeakingResult {
  overall_band: number;
  overallBand: number;
  flags: EvaluationFlagsDTO;
}

export function postProcessSpeakingScores(params: PostProcessSpeakingParams): PostProcessSpeakingResult {
  const {
    criteria,
    modelOverallBand,
    wordCount,
    durationSec,
    kind,
    isInjection,
    isNonEnglish,
    sttConfidence,
  } = params;

  // 1. Hitung ulang rata-rata 4 kriteria
  const mean =
    (criteria.fluency + criteria.lexical + criteria.grammar + criteria.pronunciation) / 4;
  const overallRecomputed = roundToHalfBand(mean);
  const recomputedDifferent =
    modelOverallBand !== undefined && modelOverallBand !== overallRecomputed;

  let currentBand = overallRecomputed;
  let scoreCapped = false;
  let capReason: 'word_count' | 'non_english' | 'duration' | null = null;
  let highBandCapped = false;

  // 2. Batas durasi (hanya untuk SPEAKING_PART2 dan MINI_TASK_SPEAKING)
  const isPart2OrMini = kind === 'SPEAKING_PART2' || kind === 'MINI_TASK_SPEAKING';
  if (isPart2OrMini) {
    if (durationSec < 30) {
      if (currentBand > 4.0) currentBand = 4.0;
      scoreCapped = true;
      capReason = 'duration';
    } else if (durationSec < 60) {
      if (currentBand > 5.5) currentBand = 5.5;
      scoreCapped = true;
      capReason = 'duration';
    }
  }

  // 3. Batas jumlah kata < 15 kata -> kap 4.0
  if (wordCount < 15) {
    if (currentBand > 4.0) currentBand = 4.0;
    scoreCapped = true;
    capReason = 'word_count';
  }

  // 4. Batas bahasa non-Inggris -> kap 4.0
  if (isNonEnglish) {
    if (currentBand > 4.0) currentBand = 4.0;
    scoreCapped = true;
    capReason = 'non_english';
  }

  // 5. Batas band tinggi (>= 8.0 menjadi 7.5 untuk model lokal)
  if (currentBand >= 8.0) {
    currentBand = 7.5;
    highBandCapped = true;
  }

  // 6. Kualitas audio rendah jika confidence < 0.5
  const isLowQuality = sttConfidence !== null && sttConfidence < 0.5;

  return {
    overall_band: currentBand,
    overallBand: currentBand,
    flags: {
      injection_suspected: isInjection,
      score_capped: scoreCapped,
      cap_reason: capReason,
      high_band_capped: highBandCapped,
      non_english_suspected: isNonEnglish,
      overall_recomputed: recomputedDifferent,
      pronunciation_estimated: true, // SELALU true untuk speaking
      low_audio_quality: isLowQuality,
    },
  };
}
