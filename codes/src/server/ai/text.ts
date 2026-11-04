/**
 * Pra-pemeriksaan deterministik dan netralisasi teks pengguna (SPEC-012). Fungsi murni.
 * Teks pengguna TIDAK dipercaya: ia hanya dimasukkan ke prompt di dalam satu pasang pembatas setelah dinetralkan.
 */
export const MAX_PROMPT_CHARS = 5000;

export const ID_STOPWORDS: ReadonlySet<string> = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'ini', 'itu', 'pada',
  'adalah', 'tidak', 'akan', 'juga', 'atau', 'saya', 'kami', 'mereka', 'dalam', 'karena',
  'sebagai', 'bisa', 'sudah', 'lebih', 'oleh', 'ada', 'seperti', 'jika', 'saat', 'namun',
  'tetapi', 'agar', 'bahwa', 'para', 'harus', 'dapat', 'kita', 'anda', 'sangat', 'banyak',
]);
export const NON_ENGLISH_THRESHOLD = 0.15;

/** Jumlah token hasil pemisahan spasi pada teks yang di-trim. */
export function countWords(text: string): number {
  const t = text.trim();
  return t === '' ? 0 : t.split(/\s+/).length;
}

// Pola dijalankan pada teks yang SUDAH dinormalkan (NFKC, tanpa \p{Cf}, spasi diratakan); hanya kuantifier berbatas pada input <= 5000 karakter.
/* eslint-disable security/detect-unsafe-regex */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass)\s+(?:[\w']+\s+){0,3}?(previous|above|prior|earlier|preceding|your|system)\s+(?:[\w']+\s+){0,2}?(instructions?|prompts?|guidelines|rules)\b/i,
  /\b(ignore|disregard|forget|override)\s+(everything|all|anything)\s+(above|before|prior|previous|else)\b/i,
  /\b(ignore|disregard|forget|override)\s+(the\s+|all\s+|these\s+)?(rules|instructions)\s+(above|before)\b/i,
  /\bgive\s+(me|this|it|my\s+\w+|the\s+\w+)?\s*(an?\s+)?band\b/i,
  /\b(give|award|assign)\b[^.!?]{0,25}\bband\b/i,
  /\b(overall_band|task_response|criteria_scores?|band_score)\b/i,
  /\bset\b[^.!?]{0,30}\b(band|score|criteri\w*|grade|mark)s?\b[^.!?]{0,30}\bto\s+\d/i,
  /system\s+prompt/i,
  /you\s+are\s+now/i,
  /act\s+as\s+(an?\s+)?(ielts|examiner|grader)/i,
  /(abaikan|lupakan)\s+(semua\s+|seluruh\s+)?(instruksi|aturan|perintah)/i,
  /beri(kan)?\s+(saya\s+|nilai\s+)?(band|skor)/i,
  /<\/?\s*(student_response|system)\b/i,
];
/* eslint-enable security/detect-unsafe-regex */

/** Normalisasi sebelum deteksi: NFKC (fullwidth -> ASCII), buang karakter format `\p{Cf}` (lebar-nol, soft hyphen), ratakan spasi. */
export function normalizeForDetection(text: string): string {
  return text.normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ');
}

export function detectInjection(text: string): boolean {
  const t = normalizeForDetection(text);
  return INJECTION_PATTERNS.some((re) => re.test(t));
}

/** Proporsi token berstopword Indonesia; token dinormalkan (huruf kecil, tanda baca tepi dibuang). */
export function indonesianRatio(text: string): number {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let hit = 0;
  for (const raw of tokens) {
    const tok = raw.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (ID_STOPWORDS.has(tok)) hit++;
  }
  return hit / tokens.length;
}

export const isNonEnglishSuspected = (text: string): boolean => indonesianRatio(text) >= NON_ENGLISH_THRESHOLD;

/**
 * Netralisasi sebelum masuk prompt: batas `student_response` (apa pun atributnya), token template chat,
 * awal baris `system:`/`assistant:`/`user:` diganti `[removed]`; ``` menjadi '''; dipotong 5000 karakter.
 */
export function neutralizeUserText(text: string): string {
  let t = text;
  t = t.replace(/<\s*\/?\s*student_response\b[^>]*>/gi, '[removed]');
  t = t.replace(/<\s*\/?\s*student_response/gi, '[removed]'); // sisa pembatas tanpa '>'
  t = t.replace(/<\|[^|>]{1,40}\|>/g, '[removed]');
  t = t.replace(/^\s*(system|assistant|user)\s*:/gim, '[removed]');
  t = t.replace(/```/g, "'''");
  return t.slice(0, MAX_PROMPT_CHARS);
}
