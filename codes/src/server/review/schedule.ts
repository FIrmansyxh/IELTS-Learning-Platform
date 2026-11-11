/**
 * Penjadwal pengulangan berjarak (SPEC-026 D3): Leitner 5 kotak. Fungsi MURNI (tanpa DB/jam) agar dapat diuji unit.
 */
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;
export const REVIEW_MAX_BOX = REVIEW_INTERVAL_DAYS.length;
export const DAY_MS = 24 * 3600 * 1000;

export interface ReviewState {
  box: number;
  /** null bila sudah dikuasai. */
  dueAtMs: number | null;
  lapses: number;
  masteredAtMs: number | null;
}

/** Interval (ms) untuk kotak 1..5. */
export const intervalMs = (box: number): number =>
  REVIEW_INTERVAL_DAYS[Math.min(Math.max(box, 1), REVIEW_MAX_BOX) - 1]! * DAY_MS;

/**
 * Keadaan jadwal berikutnya setelah satu jawaban.
 * - `null` = tidak ada jadwal (soal belum pernah salah dan dijawab benar).
 * - Jawaban benar sebelum jatuh tempo mengembalikan keadaan lama apa adanya (referensi yang sama).
 */
export function nextReviewState(prev: ReviewState | null, isCorrect: boolean, nowMs: number): ReviewState | null {
  if (!isCorrect) {
    return { box: 1, dueAtMs: nowMs + intervalMs(1), lapses: (prev?.lapses ?? 0) + 1, masteredAtMs: null };
  }
  if (!prev) return null;
  // Sudah dikuasai, atau belum jatuh tempo: jadwal tidak berubah (jeda antar-ulangan adalah intinya).
  if (prev.masteredAtMs !== null || prev.dueAtMs === null || nowMs < prev.dueAtMs) return prev;
  if (prev.box >= REVIEW_MAX_BOX) {
    return { box: REVIEW_MAX_BOX, dueAtMs: null, lapses: prev.lapses, masteredAtMs: nowMs };
  }
  const box = prev.box + 1;
  return { box, dueAtMs: nowMs + intervalMs(box), lapses: prev.lapses, masteredAtMs: null };
}

/** SPEC-026 D2: soal mandiri yang bisa diulang tanpa bacaan/audio. */
export function isReviewable(
  set: { readingPassageMarkdown: string | null; listeningAssetId: string | null },
  question: { skill?: string | null; passage_no?: number | null },
): boolean {
  if (set.readingPassageMarkdown || set.listeningAssetId) return false;
  if (question.passage_no !== null && question.passage_no !== undefined) return false;
  const skill = question.skill ?? '';
  return skill !== 'LISTENING' && skill !== 'WRITING' && skill !== 'SPEAKING';
}

/** Tipe attempt yang jawabannya dijadwalkan (SPEC-026 D1). */
export const REVIEW_SOURCE_TYPES: ReadonlySet<string> = new Set(['ACTIVE_DRILL', 'MIX_PRACTICE']);
