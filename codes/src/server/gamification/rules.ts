/** Aturan murni gamifikasi (SPEC-016): tanpa DB, bebas float pada keputusan ambang. */

export type CrownLevel = 'NONE' | 'SILVER' | 'GOLD';
const ORDER: Record<CrownLevel, number> = { NONE: 0, SILVER: 1, GOLD: 2 };

export const crownRank = (c: CrownLevel): number => ORDER[c];
export const maxCrown = (a: CrownLevel, b: CrownLevel): CrownLevel => (ORDER[a] >= ORDER[b] ? a : b);

/**
 * G4: mahkota dari skor attempt yang LULUS. Perbandingan bilangan bulat tepat (`raw*100 >= min*max`) sehingga 89,996 TIDAK
 * dibulatkan menjadi 90 (tidak naik ke GOLD karena pembulatan tampilan).
 */
export function crownFromScore(p: { passed: boolean | null; rawH: number; maxH: number; silverMin: number; goldMin: number }): CrownLevel {
  if (p.passed !== true || p.maxH <= 0) return 'NONE';
  if (p.rawH * 100 >= p.goldMin * p.maxH) return 'GOLD';
  if (p.rawH * 100 >= p.silverMin * p.maxH) return 'SILVER';
  return 'NONE';
}

export function crownValue(c: CrownLevel, pts: { silver: number; gold: number }): number {
  return c === 'GOLD' ? pts.gold : c === 'SILVER' ? pts.silver : 0;
}

/** G3: hanya selisih positif terhadap total yang sudah diberikan untuk set yang sama. */
export const incrementalPoints = (next: number, alreadyAwarded: number): number => Math.max(0, next - alreadyAwarded);

/** G1/G2 dari jawaban attempt Drill. */
export function drillCounts(answers: ReadonlyArray<{ isCorrect: boolean | null; speedStreakLen: number }>, speedMin: number) {
  let correct = 0;
  let speed = 0;
  let bestStreak = 0;
  for (const a of answers) {
    if (a.isCorrect === true) correct++;
    if (a.speedStreakLen >= speedMin) speed++;
    if (a.speedStreakLen > bestStreak) bestStreak = a.speedStreakLen;
  }
  return { correct, speed, bestStreak };
}

// ------------------------------------------------------------------ streak harian (G7/G9)
const DEFAULT_TZ = 'Asia/Jakarta';

/** Zona waktu aplikasi dari env (dibaca tiap panggilan); zona tidak valid jatuh ke Asia/Jakarta. */
export function appTimezone(env: Record<string, string | undefined> = process.env): string {
  const tz = env.APP_TIMEZONE?.trim() || DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
/** Tanggal lokal `YYYY-MM-DD` dari instan `d` pada zona `tz` (jam server, bukan zona/jam klien). */
export function localDate(d: Date, tz: string): string {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    fmtCache.set(tz, f);
  }
  const parts = f.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Selisih hari kalender `a - b` untuk dua `YYYY-MM-DD`. */
export function dayDiff(a: string, b: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((ms(a) - ms(b)) / 86_400_000);
}

export interface StreakState {
  dailyStreakDays: number;
  longestDailyStreak: number;
  lastActive: Date | null;
}
export type StreakStep =
  | { changed: false }
  | { changed: true; dailyStreakDays: number; longestDailyStreak: number };

/** G7: langkah streak untuk aktivitas pada `now`. `last >= today` (termasuk jam mundur) = tidak ada perubahan. */
export function streakStep(s: StreakState, now: Date, tz: string): StreakStep {
  const today = localDate(now, tz);
  const last = s.lastActive ? localDate(s.lastActive, tz) : null;
  if (last !== null && last >= today) return { changed: false };
  const streak = last !== null && dayDiff(today, last) === 1 ? s.dailyStreakDays + 1 : 1;
  return { changed: true, dailyStreakDays: streak, longestDailyStreak: Math.max(s.longestDailyStreak, streak) };
}

/** G9: nilai streak yang dilaporkan saat dibaca. */
export function streakView(s: StreakState, now: Date, tz: string): { dailyStreakDays: number; atRisk: boolean; lastActiveDate: string | null } {
  if (!s.lastActive) return { dailyStreakDays: 0, atRisk: false, lastActiveDate: null };
  const today = localDate(now, tz);
  const last = localDate(s.lastActive, tz);
  const gap = dayDiff(today, last);
  return { dailyStreakDays: gap > 1 ? 0 : s.dailyStreakDays, atRisk: gap === 1, lastActiveDate: last };
}
