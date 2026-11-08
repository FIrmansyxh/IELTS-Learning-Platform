/**
 * Pemilih soal campuran (SPEC-022 D5): fungsi MURNI tanpa DB/jam. Seluruh masukan (pool, radar, riwayat, jam, PRNG)
 * diberikan pemanggil sehingga deterministik dan dapat diuji unit.
 *
 * Urutan keputusan:
 *  1. filter pool (AND) -> 2. kapasitas efektif (Writing/Speaking maks 1) -> 3. penarikan tanpa pengembalian
 *  (MANUAL seragam; AUTO_WEAKNESS dua tahap skill -> soal) -> 4. paket Reading utuh -> 5. urutan = urutan tarik.
 */
import { createHash } from 'node:crypto';
import type { Question } from '@/contracts/content';
import { mulberry32 } from '../attempts/prng';

export const MIX_POOL_SKILLS = ['GRAMMAR', 'VOCAB', 'READING', 'WRITING', 'SPEAKING'] as const;
export type MixPoolSkill = (typeof MIX_POOL_SKILLS)[number];

/** Soal tanpa `difficulty` dianggap tingkat ini (Keputusan Analyst #5). */
export const DEFAULT_DIFFICULTY = 3;
export const GAP_BASE = 9.0;
export const MIN_SKILL_WEIGHT = 0.5;
export const STREAK_DISCOUNT = 0.3;
export const WINDOW_30D_MS = 30 * 24 * 3600 * 1000;

export interface PoolQuestion {
  question_id: string;
  bank_set_id: string;
  bank_code: string;
  bank_kind: string;
  bank_version: number;
  skill: string;
  question_type: string;
  difficulty: number | null;
  passage_no: number | null;
  /** Urutan soal dalam bank (0-based); menentukan urutan di dalam paket Reading. */
  position: number;
  question: Question;
}

export interface MixSelectRequest {
  skills?: readonly string[];
  bank_kinds?: readonly string[];
  question_types?: readonly string[];
  difficulty_min?: number;
  difficulty_max?: number;
  count: number;
  mode: 'MANUAL' | 'AUTO_WEAKNESS';
}

export interface RadarEntry {
  skill: string;
  /** `user_skill_scores.estimated_band`; null bila belum ada cukup sampel. */
  estimated_band: number | null;
}

export interface HistoryAnswer {
  question_id: string;
  question_type: string;
  is_correct: boolean | null;
  answered_at_ms: number;
  /** attempt berstatus GRADED/EXPIRED (dipakai untuk `salah_tipe_30h`). */
  attempt_final: boolean;
}
export interface MixHistory {
  answers: readonly HistoryAnswer[];
  /** Jam acuan jendela 30 hari (epoch ms). */
  now_ms: number;
}

export type MixSelection =
  | { ok: true; questions: PoolQuestion[]; capacity: number }
  | { ok: false; max_available: number };

// ---------------------------------------------------------------- PRNG
/** PRNG `mulberry32` dari hash SHA-256 `seed` dipotong 32 bit (D5.6). */
export function rngFromSeed(seed: string): () => number {
  const h = createHash('sha256').update(seed).digest();
  return mulberry32(h.readUInt32BE(0));
}

// ---------------------------------------------------------------- filter dan kapasitas
const isAi = (q: Pick<PoolQuestion, 'skill'>): boolean => q.skill === 'WRITING' || q.skill === 'SPEAKING';

export function filterPool(pool: readonly PoolQuestion[], r: MixSelectRequest): PoolQuestion[] {
  const skills = new Set(r.skills ?? MIX_POOL_SKILLS);
  const kinds = r.bank_kinds ? new Set(r.bank_kinds) : null;
  const types = r.question_types ? new Set(r.question_types) : null;
  const lo = r.difficulty_min ?? 1;
  const hi = r.difficulty_max ?? 5;
  return pool.filter((q) => {
    if (q.skill === 'LISTENING' || !skills.has(q.skill)) return false;
    if (kinds && !kinds.has(q.bank_kind)) return false;
    if (types && !types.has(q.question_type)) return false;
    const d = q.difficulty ?? DEFAULT_DIFFICULTY;
    return d >= lo && d <= hi;
  });
}

/** Kapasitas efektif = soal objektif + min(1, Writing) + min(1, Speaking). */
export function effectiveCapacity(filtered: readonly PoolQuestion[]): number {
  let objective = 0;
  let writing = 0;
  let speaking = 0;
  for (const q of filtered) {
    if (q.skill === 'WRITING') writing++;
    else if (q.skill === 'SPEAKING') speaking++;
    else objective++;
  }
  return objective + Math.min(1, writing) + Math.min(1, speaking);
}

// ---------------------------------------------------------------- bobot AUTO_WEAKNESS
/** `W_skill` per skill (D5.3); skill tanpa nilai memakai rata-rata gap; tak ada satu pun nilai -> semua 1. */
export function skillWeights(skills: readonly string[], radar: readonly RadarEntry[]): Map<string, number> {
  const gaps = new Map<string, number>();
  for (const r of radar) if (r.estimated_band !== null) gaps.set(r.skill, GAP_BASE - r.estimated_band);
  const out = new Map<string, number>();
  if (gaps.size === 0) {
    for (const s of skills) out.set(s, 1);
    return out;
  }
  const mean = [...gaps.values()].reduce((a, b) => a + b, 0) / gaps.size;
  for (const s of skills) out.set(s, Math.max(gaps.get(s) ?? mean, MIN_SKILL_WEIGHT));
  return out;
}

/** `salah_tipe_30h`: jawaban salah / jawaban ber-`is_correct` (attempt final, <= 30 hari) untuk satu tipe; 0 bila tidak ada. */
export function wrongRatioByType(history: MixHistory): Map<string, number> {
  const agg = new Map<string, { wrong: number; total: number }>();
  for (const a of history.answers) {
    if (!a.attempt_final || a.is_correct === null) continue;
    const age = history.now_ms - a.answered_at_ms;
    if (age < 0 || age > WINDOW_30D_MS) continue;
    const e = agg.get(a.question_type) ?? { wrong: 0, total: 0 };
    e.total++;
    if (!a.is_correct) e.wrong++;
    agg.set(a.question_type, e);
  }
  return new Map([...agg].map(([k, v]) => [k, v.total === 0 ? 0 : v.wrong / v.total]));
}

/** question_id yang dua jawaban terbarunya (urut `answered_at` menurun) keduanya benar. */
export function correctTwiceInRow(history: MixHistory): Set<string> {
  const byQ = new Map<string, HistoryAnswer[]>();
  for (const a of history.answers) {
    const l = byQ.get(a.question_id) ?? [];
    l.push(a);
    byQ.set(a.question_id, l);
  }
  const out = new Set<string>();
  for (const [qid, rows] of byQ) {
    const latest = [...rows].sort((x, y) => y.answered_at_ms - x.answered_at_ms).slice(0, 2);
    if (latest.length === 2 && latest.every((r) => r.is_correct === true)) out.add(qid);
  }
  return out;
}

/** `T_q = (1 + salah_tipe_30h) x (0,3 bila benar 2x berturut-turut else 1)`; Writing/Speaking selalu 1. */
export function questionWeight(
  q: Pick<PoolQuestion, 'question_id' | 'question_type' | 'skill'>,
  wrongByType: ReadonlyMap<string, number>,
  twice: ReadonlySet<string>,
): number {
  if (isAi(q)) return 1;
  return (1 + (wrongByType.get(q.question_type) ?? 0)) * (twice.has(q.question_id) ? STREAK_DISCOUNT : 1);
}

// ---------------------------------------------------------------- penarikan
function pickWeighted<T>(items: readonly T[], weights: readonly number[], rng: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
  let x = rng() * total;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i]!;
    if (x < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

const orderKey = (q: PoolQuestion): string => `${q.bank_code}\u0000${String(q.position).padStart(6, '0')}`;
const packageKey = (q: Pick<PoolQuestion, 'bank_set_id' | 'passage_no'>): string => `${q.bank_set_id}#${q.passage_no}`;

/**
 * `selectMix(pool, request, radar, history, rng)` (SPEC-022 D5). `pool` boleh berisi apa saja; filter dan batas ada di sini.
 */
export function selectMix(
  pool: readonly PoolQuestion[],
  request: MixSelectRequest,
  radar: readonly RadarEntry[],
  history: MixHistory,
  rng: () => number,
): MixSelection {
  // Urutan stabil: hasil tidak bergantung pada urutan baris DB.
  const filtered = filterPool(pool, request).sort((a, b) => (orderKey(a) < orderKey(b) ? -1 : orderKey(a) > orderKey(b) ? 1 : 0));
  const capacity = effectiveCapacity(filtered);
  if (capacity < request.count) return { ok: false, max_available: capacity };

  const remaining = new Set<PoolQuestion>(filtered);
  const picked: PoolQuestion[] = [];
  const aiTaken = new Set<string>();

  const wrongByType = request.mode === 'AUTO_WEAKNESS' ? wrongRatioByType(history) : new Map<string, number>();
  const twice = request.mode === 'AUTO_WEAKNESS' ? correctTwiceInRow(history) : new Set<string>();

  const take = (q: PoolQuestion): void => {
    remaining.delete(q);
    picked.push(q);
    if (isAi(q)) {
      aiTaken.add(q.skill);
      // Writing/Speaking maks 1 per sesi: sisa kandidat skill itu dikeluarkan.
      for (const r of [...remaining]) if (r.skill === q.skill) remaining.delete(r);
    }
  };

  while (picked.length < request.count && remaining.size > 0) {
    const candidates = [...remaining];
    let chosen: PoolQuestion;
    if (request.mode === 'MANUAL') {
      chosen = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))]!;
    } else {
      const skills = MIX_POOL_SKILLS.filter((s) => candidates.some((c) => c.skill === s));
      const sw = skillWeights(skills, radar);
      const skill = pickWeighted(skills, skills.map((s) => sw.get(s) ?? 1), rng);
      const inSkill = candidates.filter((c) => c.skill === skill);
      chosen = pickWeighted(inSkill, inSkill.map((c) => questionWeight(c, wrongByType, twice)), rng);
    }

    if (chosen.skill === 'READING' && chosen.passage_no !== null) {
      // Paket Reading (D4/D5.4): seluruh soal (bank, passage_no) masuk berurutan menurut bank; bila sisa kapasitas lebih
      // kecil dari ukuran paket, hanya `sisa` soal PERTAMA paket yang masuk (teks tetap dibawa utuh oleh pemanggil).
      const key = packageKey(chosen);
      const pack = [...remaining].filter((c) => c.skill === 'READING' && packageKey(c) === key).sort((a, b) => a.position - b.position);
      for (const p of pack.slice(0, request.count - picked.length)) take(p);
    } else {
      take(chosen);
    }
  }

  return { ok: true, questions: picked, capacity };
}

/** Kunci paket Reading `(bank, passage_no)` untuk pemanggil yang menyusun `passages[]`. */
export const passageKeyOf = packageKey;
