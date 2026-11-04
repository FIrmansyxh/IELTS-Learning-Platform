/**
 * Aturan murni Boss Stage (SPEC-014). Tanpa DB: urutan section, penilaian section objektif (D5), gerbang (D6), dan
 * estimasi Overall Band (D8). Semua aritmetika skor dalam bilangan bulat sentesimal agar bebas galat float.
 */
import { bossBand, convertRawToBand, overallBand, scaleToForty, type BandRowLike } from '../band/convert';
import { percentHundredths } from '../attempts/engine';

export type BossSkill = 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';
export const BOSS_SKILL_ORDER: readonly BossSkill[] = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'];
export const SECTION_GRACE_MS = 5000;
/** D4: pengaman keseluruhan di atas jumlah waktu section. */
export const BOSS_OVERALL_BUFFER_SECONDS = 1800;
export const isGateSkill = (s: BossSkill): boolean => s === 'LISTENING' || s === 'READING';

export const bossSkillOrder = (skill: string | null): number => {
  const i = BOSS_SKILL_ORDER.indexOf(skill as BossSkill);
  return i < 0 ? 99 : i + 1;
};

/** D4: `attempts.deadline_at` = mulai + jumlah semua `time_limit_seconds` + 1800 detik. */
export const bossDeadlineSeconds = (timeLimits: readonly number[]): number =>
  timeLimits.reduce((a, b) => a + b, 0) + BOSS_OVERALL_BUFFER_SECONDS;

export interface SectionScore {
  rawH: number;
  maxH: number;
  /** `scaleToForty` (0-40). */
  raw40: number;
  band: number;
}

/** D5: skor section Listening/Reading. `maxH = 0` (tidak mungkin pada set PUBLISHED) -> raw40 0. */
export function scoreObjectiveSection(rawH: number, maxH: number, table: readonly BandRowLike[]): SectionScore {
  // F-14-03: jepit raw <= max (set diubah saat attempt berjalan tidak boleh membuat penilaian melempar 500).
  const clamped = Math.max(0, Math.min(rawH, Math.max(0, maxH)));
  const raw40 = maxH <= 0 ? 0 : scaleToForty(clamped / 100, maxH / 100);
  return { rawH: clamped, maxH, raw40, band: convertRawToBand(table, raw40) };
}

export interface GateInput {
  type: 'PERCENT' | 'BAND';
  value: number;
}
export interface GateOutcome {
  passed: boolean;
  /** Persen L+R (2 desimal, dibulatkan setengah ke atas), sentesimal. */
  percentH: number;
  bossBand: number;
}

/**
 * D6. PERCENT: `(L.raw + R.raw) * 100 >= gate * (L.max + R.max)` dalam bilangan bulat (poin mentah, tanpa penskalaan).
 * BAND: `bossBand(L, R) >= gate`. `bossBand` selalu dihitung untuk informasi.
 */
export function evaluateGate(gate: GateInput, l: SectionScore, r: SectionScore): GateOutcome {
  const rawH = l.rawH + r.rawH;
  const maxH = l.maxH + r.maxH;
  const band = bossBand(l.band, r.band);
  let passed: boolean;
  if (gate.type === 'BAND') {
    passed = band >= gate.value;
  } else {
    // gate dalam sentesimal persen (80.0 -> 8000); rawH*100 poin-sentesimal -> persen: rawH*10000 >= gateH*maxH.
    const gateH = Math.round(gate.value * 100);
    passed = maxH > 0 && rawH * 10000 >= gateH * maxH;
  }
  return { passed, percentH: percentHundredths(rawH, maxH), bossBand: band };
}

export interface AiBandInput {
  /** `ai_evaluations.method`. */
  method: string;
  overallBand: number | null;
  injectionSuspected: boolean;
}
/** D8: hanya evaluasi `AI_LOCAL` bernilai dan tidak bertanda injeksi yang dihitung. */
export const countsForEstimate = (e: AiBandInput): boolean => e.method === 'AI_LOCAL' && e.overallBand !== null && !e.injectionSuspected;

/** D8: `overallBand(L, R, W, S)` bila keempat ada; selain itu null. */
export function overallEstimate(l: number | null, r: number | null, w: number | null, s: number | null): number | null {
  if (l === null || r === null || w === null || s === null) return null;
  return overallBand({ listening: l, reading: r, writing: w, speaking: s });
}
