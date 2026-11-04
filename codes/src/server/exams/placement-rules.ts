/**
 * Aturan murni Placement adaptif (SPEC-015): pemilihan soal staircase (D3) dan rekomendasi Tier (D4).
 * Tanpa DB; aritmetika rata-rata dalam bilangan bulat agar bebas galat float.
 */
import { mulberry32 } from '../attempts/prng';

export const START_DIFFICULTY = 3;
/** D3: urutan ofset pencarian kesulitan terdekat bila tingkat target habis. */
export const OFFSETS: readonly number[] = [1, -1, 2, -2, 3, -3, 4, -4];

export interface BankItem {
  question_id: string;
  difficulty: number;
}

/** D3: setelah jawaban, benar -> naik satu (maks 5); salah -> turun satu (min 1). */
export const nextDifficulty = (d: number, correct: boolean): number => (correct ? Math.min(5, d + 1) : Math.max(1, d - 1));

/** Seed PRNG dari 8 hex pertama id attempt. */
export const seedOf = (attemptId: string): number => parseInt(attemptId.replace(/-/g, '').slice(0, 8), 16) >>> 0;

/**
 * D3: pilih soal berikutnya. Kandidat = belum tersaji pada `d`, urut `question_id` naik; indeks `floor(rand * n)` dengan
 * `rand` dari mulberry32(seed id attempt) yang digeser sebanyak jumlah soal tersaji. Tanpa kandidat pada `d`, ofset
 * `+1,-1,+2,-2,...` (kesulitan 1..5) dipakai berurutan. null bila bank habis.
 */
export function pickNext(bank: readonly BankItem[], served: readonly string[], d: number, attemptId: string): string | null {
  const taken = new Set(served);
  const pool = bank.filter((b) => !taken.has(b.question_id));
  const rng = mulberry32(seedOf(attemptId));
  for (let i = 0; i < served.length; i++) rng();
  const rand = rng();
  for (const off of [0, ...OFFSETS]) {
    const level = d + off;
    if (level < 1 || level > 5) continue;
    const candidates = pool.filter((b) => b.difficulty === level).map((b) => b.question_id).sort();
    if (candidates.length > 0) return candidates[Math.floor(rand * candidates.length)]!;
  }
  return null;
}

export interface Recommendation {
  recommended_tier: number;
  /** Rata-rata kesulitan maks 10 soal terakhir, 2 desimal (setengah ke atas). */
  ability: number;
  correct_count: number;
  served_count: number;
}

/** Jumlah soal default (`placement.question_count`) bila pemanggil tidak menyebut N. */
export const DEFAULT_QUESTION_COUNT = 25;

/**
 * D4 (amandemen F-15-01): batas Tier menurut bukti = `1 + floor(3 * dijawab / N)`. Tier tinggi butuh cukup jawaban
 * (N=25: <=8 jawaban -> Tier 1, 9-16 -> maks 2, 17-24 -> maks 3, 25 -> bebas sampai 4). Aritmetika bilangan bulat.
 */
export const evidenceTierCap = (answered: number, n: number): number => 1 + Math.floor((3 * Math.max(0, answered)) / Math.max(1, n));

/** D4. `history` = soal yang dijawab, berurutan; `n` = jumlah soal tes (batas bukti). */
export function recommend(
  history: ReadonlyArray<{ difficulty: number; correct: boolean }>,
  n: number = DEFAULT_QUESTION_COUNT,
): Recommendation {
  const served = history.length;
  const correct = history.filter((h) => h.correct).length;
  const last = history.slice(-10);
  const abilityH = last.length === 0 ? 0 : Math.floor((2 * last.reduce((a, h) => a + h.difficulty, 0) * 100 + last.length) / (2 * last.length));
  const ability = abilityH / 100;
  const byAbility = served === 0 || correct * 100 < 32 * served ? 1 : Math.min(4, Math.max(1, Math.floor(ability)));
  const tier = Math.min(byAbility, evidenceTierCap(served, n));
  return { recommended_tier: tier, ability, correct_count: correct, served_count: served };
}
