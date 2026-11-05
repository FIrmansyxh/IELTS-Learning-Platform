/**
 * Logika skor, deteksi injeksi, netralisasi, dan pembatasan skor AI Writing (SPEC-012).
 */
export const ID_STOPWORDS = new Set([
  'yang',
  'dan',
  'di',
  'ke',
  'dari',
  'untuk',
  'dengan',
  'ini',
  'itu',
  'pada',
  'adalah',
  'tidak',
  'akan',
  'juga',
  'atau',
  'saya',
  'kami',
  'mereka',
  'dalam',
  'karena',
  'sebagai',
  'bisa',
  'sudah',
  'lebih',
  'oleh',
  'ada',
  'seperti',
  'jika',
  'saat',
  'namun',
  'tetapi',
  'agar',
  'bahwa',
  'para',
  'harus',
  'dapat',
  'kita',
  'anda',
  'sangat',
  'banyak',
]);

/* eslint-disable security/detect-unsafe-regex */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+|the\s+)?(previous|above|prior)\s+(instructions|rules)/i,
  /give\s+(me|this)\s+(a\s+)?band/i,
  /system\s+prompt/i,
  /you\s+are\s+now/i,
  /act\s+as\s+(an?\s+)?(ielts|examiner|grader)/i,
  /abaikan\s+(semua\s+|seluruh\s+)?(instruksi|aturan)/i,
  /beri(kan)?\s+(saya\s+)?(nilai\s+)?band/i,
  /<\/?(student_response|system)[^>]*>/i,
];
/* eslint-enable security/detect-unsafe-regex */

/** Hitung jumlah kata (pemisahan spasi pada teks yang di-trim). */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/** Periksa apakah teks dicurigai mengandung prompt injection. */
export function isInjectionSuspected(text: string): boolean {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

/** Periksa apakah proporsi kata bahasa Indonesia >= 0.15 (15%). */
export function isNonEnglishSuspected(text: string): boolean {
  const words = text.toLowerCase().match(/\b[a-z]{2,}\b/g) || [];
  if (words.length === 0) return false;
  let idCount = 0;
  for (const w of words) {
    if (ID_STOPWORDS.has(w)) idCount++;
  }
  return idCount / words.length >= 0.15;
}

/** Netralisasi teks pengguna sebelum dimasukkan ke dalam prompt LLM. */
export function neutralizeUserInput(text: string): string {
  let cleaned = text;
  // Ganti tag student_response
  cleaned = cleaned.replace(/<\/?student_response[^>]*>/gi, '[removed]');
  // Ganti pola token template chat <|...|>
  cleaned = cleaned.replace(/<\|[^|>]{1,40}\|>/g, '[removed]');
  // Ganti awal baris peniru peran chat (system:, assistant:, user:)
  cleaned = cleaned.replace(/^\s*(system|assistant|user)\s*:/gim, '[removed]');
  // Ganti triple backtick dengan triple single quote
  cleaned = cleaned.replace(/```/g, "'''");
  // Potong maksimal 5000 karakter
  return cleaned.slice(0, 5000);
}

/** Bulatkan ke kelipatan 0.5 terdekat (SPEC-009). */
export function roundToHalfBand(val: number): number {
  return Math.round(val * 2) / 2;
}

export interface CriteriaScores {
  task_response: number;
  coherence: number;
  lexical: number;
  grammar: number;
}

export interface EvaluationFlagsResult {
  injection_suspected: boolean;
  score_capped: boolean;
  cap_reason: 'word_count' | 'non_english' | 'duration' | null;
  high_band_capped: boolean;
  non_english_suspected: boolean;
  overall_recomputed: boolean;
  pronunciation_estimated: boolean;
  low_audio_quality: boolean;
}

export interface PostProcessResult {
  overall_band: number;
  overallBand: number;
  flags: EvaluationFlagsResult;
}

/**
 * Pasca-proses skor evaluasi AI secara deterministik di kode sesuai SPEC-012.
 */
export function postProcessScores(params: {
  criteria: CriteriaScores;
  modelOverallBand?: number;
  modelOverall?: number;
  wordCount: number;
  minWords?: number | null;
  isInjection?: boolean;
  injectionSuspected?: boolean;
  isNonEnglish?: boolean;
  nonEnglishSuspected?: boolean;
  isMiniTask?: boolean;
}): PostProcessResult {
  const { criteria, wordCount, minWords } = params;
  const modelBand = params.modelOverallBand ?? params.modelOverall;
  const isInjection = params.isInjection ?? params.injectionSuspected ?? false;
  const isNonEnglish = params.isNonEnglish ?? params.nonEnglishSuspected ?? false;

  // 1. Hitung ulang overall_band dari rata-rata 4 kriteria
  const mean = (criteria.task_response + criteria.coherence + criteria.lexical + criteria.grammar) / 4;
  const overallRecomputed = roundToHalfBand(mean);
  const recomputedDifferent = modelBand !== undefined && modelBand !== overallRecomputed;

  let currentBand = overallRecomputed;
  let scoreCapped = false;
  let capReason: 'word_count' | 'non_english' | 'duration' | null = null;
  let highBandCapped = false;

  // 2. Batas panjang (hanya jika minWords ada dan > 0)
  if (minWords && minWords > 0) {
    const r = wordCount / minWords;
    let wordCap: number | null = null;
    if (r < 0.5) {
      wordCap = 3.5;
    } else if (r < 0.8) {
      wordCap = 5.0;
    } else if (r < 1.0) {
      wordCap = 6.0;
    }

    if (wordCap !== null && currentBand > wordCap) {
      currentBand = wordCap;
      scoreCapped = true;
      capReason = 'word_count';
    }
  }

  // 3. Batas non-Inggris (kap 4.0, menimpa alasan yang lebih longgar)
  if (isNonEnglish) {
    if (currentBand > 4.0) {
      currentBand = 4.0;
    }
    scoreCapped = true;
    capReason = 'non_english';
  }

  // 4. Batas band tinggi (>= 8.0 menjadi 7.5 untuk penilai AI lokal)
  if (currentBand >= 8.0) {
    currentBand = 7.5;
    highBandCapped = true;
  }

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
      pronunciation_estimated: false,
      low_audio_quality: false,
    },
  };
}
