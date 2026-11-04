import { describe, expect, it } from 'vitest';
import { MIN_HUMAN_MS, answerTiming, computeTimings } from '@/server/attempts/engine';
import {
  appTimezone,
  crownFromScore,
  crownValue,
  dayDiff,
  drillCounts,
  incrementalPoints,
  localDate,
  maxCrown,
  streakStep,
  streakView,
} from '@/server/gamification/rules';

const T = (iso: string) => new Date(iso);

describe('crownFromScore (G4)', () => {
  const base = { silverMin: 75, goldMin: 90 };
  it('74,99 tidak lulus -> NONE; lulus tepat 75 -> SILVER; 89,99 -> SILVER; 90,00 -> GOLD', () => {
    expect(crownFromScore({ ...base, passed: false, rawH: 7499, maxH: 10000 })).toBe('NONE');
    expect(crownFromScore({ ...base, passed: true, rawH: 7500, maxH: 10000 })).toBe('SILVER');
    expect(crownFromScore({ ...base, passed: true, rawH: 8999, maxH: 10000 })).toBe('SILVER');
    expect(crownFromScore({ ...base, passed: true, rawH: 9000, maxH: 10000 })).toBe('GOLD');
  });
  it('perbandingan tepat: 89,996 tidak dibulatkan menjadi GOLD', () => {
    expect(crownFromScore({ ...base, passed: true, rawH: 899960, maxH: 1000000 })).toBe('SILVER');
  });
  it('tidak lulus / null / max 0 -> NONE walau skor tinggi', () => {
    expect(crownFromScore({ ...base, passed: false, rawH: 10000, maxH: 10000 })).toBe('NONE');
    expect(crownFromScore({ ...base, passed: null, rawH: 10000, maxH: 10000 })).toBe('NONE');
    expect(crownFromScore({ ...base, passed: true, rawH: 0, maxH: 0 })).toBe('NONE');
  });
  it('ambang kustom dihormati', () => {
    expect(crownFromScore({ silverMin: 60, goldMin: 80, passed: true, rawH: 8000, maxH: 10000 })).toBe('GOLD');
    expect(crownFromScore({ silverMin: 60, goldMin: 80, passed: true, rawH: 6000, maxH: 10000 })).toBe('SILVER');
  });
});

describe('mahkota monoton dan nilai poin', () => {
  it('maxCrown tidak pernah turun', () => {
    expect(maxCrown('GOLD', 'SILVER')).toBe('GOLD');
    expect(maxCrown('NONE', 'SILVER')).toBe('SILVER');
    expect(maxCrown('SILVER', 'NONE')).toBe('SILVER');
  });
  it('nilai poin kumulatif NONE=0, SILVER=50, GOLD=100', () => {
    const pts = { silver: 50, gold: 100 };
    expect(crownValue('NONE', pts)).toBe(0);
    expect(crownValue('SILVER', pts)).toBe(50);
    expect(crownValue('GOLD', pts)).toBe(100);
    expect(crownValue('GOLD', pts) - crownValue('SILVER', pts)).toBe(50);
  });
});

describe('poin hanya peningkatan (G3) dan hitung Drill (G1/G2)', () => {
  it('incrementalPoints', () => {
    expect(incrementalPoints(80, 0)).toBe(80);
    expect(incrementalPoints(90, 80)).toBe(10);
    expect(incrementalPoints(70, 90)).toBe(0);
    expect(incrementalPoints(0, 0)).toBe(0);
  });
  it('contoh spec: streak [1,2,3,4,0,1,2,3,0,1], 8 benar, min 3 -> 3 jawaban speed', () => {
    const streaks = [1, 2, 3, 4, 0, 1, 2, 3, 0, 1];
    const answers = streaks.map((s, i) => ({ isCorrect: i !== 4 && i !== 8, speedStreakLen: s }));
    expect(drillCounts(answers, 3)).toEqual({ correct: 8, speed: 3, bestStreak: 4 });
  });
  it('jawaban null (AI) tidak dihitung benar', () => {
    expect(drillCounts([{ isCorrect: null, speedStreakLen: 0 }], 3)).toEqual({ correct: 0, speed: 0, bestStreak: 0 });
  });
});

describe('streak harian (G7/G9) pada APP_TIMEZONE', () => {
  const JKT = 'Asia/Jakarta';
  const s0 = { dailyStreakDays: 0, longestDailyStreak: 0, lastActive: null as Date | null };

  it('tanggal lokal: 23:59 WIB dan 00:01 WIB hari berikutnya = dua hari', () => {
    // 23:59 WIB 2026-11-03 = 16:59 UTC; 00:01 WIB 2026-11-04 = 17:01 UTC
    expect(localDate(T('2026-11-03T16:59:00Z'), JKT)).toBe('2026-11-03');
    expect(localDate(T('2026-11-03T17:01:00Z'), JKT)).toBe('2026-11-04');
    expect(localDate(T('2026-11-03T16:59:00Z'), 'UTC')).toBe('2026-11-03');
    expect(localDate(T('2026-11-03T17:01:00Z'), 'UTC')).toBe('2026-11-03');
  });
  it('dayDiff lintas bulan/tahun', () => {
    expect(dayDiff('2026-11-04', '2026-11-03')).toBe(1);
    expect(dayDiff('2027-01-01', '2026-12-31')).toBe(1);
    expect(dayDiff('2026-03-01', '2026-02-28')).toBe(1);
    expect(dayDiff('2026-11-06', '2026-11-04')).toBe(2);
  });
  it('urutan spec: 3 Nov -> 4 Nov -> 6 Nov = streak 1, 2, 1; longest 2', () => {
    const a = streakStep(s0, T('2026-11-03T03:00:00Z'), JKT); // 10:00 WIB
    expect(a).toEqual({ changed: true, dailyStreakDays: 1, longestDailyStreak: 1 });
    const b = streakStep({ dailyStreakDays: 1, longestDailyStreak: 1, lastActive: T('2026-11-03T03:00:00Z') }, T('2026-11-04T02:00:00Z'), JKT); // 09:00 WIB
    expect(b).toEqual({ changed: true, dailyStreakDays: 2, longestDailyStreak: 2 });
    const c = streakStep({ dailyStreakDays: 2, longestDailyStreak: 2, lastActive: T('2026-11-04T02:00:00Z') }, T('2026-11-06T02:00:00Z'), JKT);
    expect(c).toEqual({ changed: true, dailyStreakDays: 1, longestDailyStreak: 2 });
  });
  it('hari lokal sama tidak mengubah apa pun; jam mundur (last > today) juga tidak', () => {
    const last = T('2026-11-03T03:00:00Z');
    expect(streakStep({ dailyStreakDays: 3, longestDailyStreak: 3, lastActive: last }, T('2026-11-03T10:00:00Z'), JKT)).toEqual({ changed: false });
    expect(streakStep({ dailyStreakDays: 3, longestDailyStreak: 3, lastActive: T('2026-11-10T03:00:00Z') }, T('2026-11-03T10:00:00Z'), JKT)).toEqual({ changed: false });
  });
  it('23:59 WIB lalu 00:01 WIB = streak naik; di UTC 16:59 dan 17:01 hari yang sama', () => {
    const first = T('2026-11-03T16:59:00Z');
    const second = T('2026-11-03T17:01:00Z');
    expect(streakStep({ dailyStreakDays: 1, longestDailyStreak: 1, lastActive: first }, second, JKT)).toEqual({ changed: true, dailyStreakDays: 2, longestDailyStreak: 2 });
    expect(streakStep({ dailyStreakDays: 1, longestDailyStreak: 1, lastActive: first }, second, 'UTC')).toEqual({ changed: false });
  });
  it('streakView: 3 hari lalu -> 0 & tidak berisiko; kemarin -> berisiko & nilai tersimpan; hari ini -> nilai tersimpan', () => {
    const now = T('2026-11-06T05:00:00Z');
    const mk = (iso: string) => ({ dailyStreakDays: 5, longestDailyStreak: 7, lastActive: T(iso) });
    expect(streakView(mk('2026-11-03T05:00:00Z'), now, JKT)).toEqual({ dailyStreakDays: 0, atRisk: false, lastActiveDate: '2026-11-03' });
    expect(streakView(mk('2026-11-05T05:00:00Z'), now, JKT)).toEqual({ dailyStreakDays: 5, atRisk: true, lastActiveDate: '2026-11-05' });
    expect(streakView(mk('2026-11-06T01:00:00Z'), now, JKT)).toEqual({ dailyStreakDays: 5, atRisk: false, lastActiveDate: '2026-11-06' });
    expect(streakView({ dailyStreakDays: 0, longestDailyStreak: 0, lastActive: null }, now, JKT)).toEqual({ dailyStreakDays: 0, atRisk: false, lastActiveDate: null });
  });
  it('appTimezone: default Asia/Jakarta, zona tidak valid jatuh ke default', () => {
    expect(appTimezone({})).toBe('Asia/Jakarta');
    expect(appTimezone({ APP_TIMEZONE: 'UTC' })).toBe('UTC');
    expect(appTimezone({ APP_TIMEZONE: 'Bukan/Zona' })).toBe('Asia/Jakarta');
  });
});

describe('answerTiming (F-08-06): resume tidak dapat mereset basis bonus kecepatan', () => {
  const base = { prevStreak: 2, targetMs: 10_000, isCorrect: true };
  const t0 = 1_000_000;
  it('tanpa resume: dalam target menaikkan streak', () => {
    const r = answerTiming({ ...base, nowMs: t0 + 4000, prevAnsweredAtMs: null, startedAtMs: t0, lastResumeAtMs: t0 });
    expect(r).toMatchObject({ timeSpentMs: 4000, withinTargetTime: true, speedStreakLen: 3, resumeShifted: false });
  });
  it('resume menggeser basis setelah jawaban sebelumnya: time_spent tetap sejak resume tetapi TIDAK dikreditkan', () => {
    const r = answerTiming({ ...base, nowMs: t0 + 305_000, prevAnsweredAtMs: t0 + 5000, startedAtMs: t0, lastResumeAtMs: t0 + 300_000 });
    expect(r).toMatchObject({ timeSpentMs: 5000, withinTargetTime: false, speedStreakLen: 0, resumeShifted: true });
  });
  it('resume yang lebih awal dari jawaban sebelumnya tidak berpengaruh', () => {
    const r = answerTiming({ ...base, nowMs: t0 + 9000, prevAnsweredAtMs: t0 + 6000, startedAtMs: t0, lastResumeAtMs: t0 + 2000 });
    expect(r).toMatchObject({ timeSpentMs: 3000, withinTargetTime: true, speedStreakLen: 3, resumeShifted: false });
  });
  it('awal section Boss memperpendek time_spent tanpa dianggap resume', () => {
    const r = answerTiming({ ...base, nowMs: t0 + 70_000, prevAnsweredAtMs: null, startedAtMs: t0, lastResumeAtMs: t0, sectionStartMs: t0 + 60_000 });
    expect(r).toMatchObject({ timeSpentMs: 10_000, withinTargetTime: true, resumeShifted: false });
  });
  it('jawaban salah selalu streak 0', () => {
    expect(answerTiming({ ...base, isCorrect: false, nowMs: t0 + 1000, prevAnsweredAtMs: null, startedAtMs: t0, lastResumeAtMs: t0 }).speedStreakLen).toBe(0);
  });
});

describe('answerTiming (F-16-01): batas manusia', () => {
  const base = { prevStreak: 2, targetMs: 10_000, isCorrect: true };
  const t0 = 1_000_000;
  it('batas manusia 2000 ms', () => expect(MIN_HUMAN_MS).toBe(2000));
  it('jawaban benar < 2000 ms sejak jawaban sebelumnya: time_spent jujur, tetapi TIDAK dikreditkan dan streak 0', () => {
    const r = answerTiming({ ...base, nowMs: t0 + 5000 + 40, prevAnsweredAtMs: t0 + 5000, startedAtMs: t0, lastResumeAtMs: t0 });
    expect(r).toMatchObject({ timeSpentMs: 40, withinTargetTime: false, speedStreakLen: 0, resumeShifted: false });
  });
  it('tepat 1999 ms ditolak; tepat 2000 ms dikreditkan', () => {
    expect(answerTiming({ ...base, nowMs: t0 + 1999, prevAnsweredAtMs: null, startedAtMs: t0, lastResumeAtMs: t0 }).withinTargetTime).toBe(false);
    expect(answerTiming({ ...base, nowMs: t0 + 2000, prevAnsweredAtMs: null, startedAtMs: t0, lastResumeAtMs: t0 })).toMatchObject({ withinTargetTime: true, speedStreakLen: 3 });
  });
  it('burst 10 jawaban benar berselang 30 ms: streak tidak pernah naik', () => {
    let prevAt: number | null = t0;
    let streak = 0;
    for (let i = 1; i <= 10; i++) {
      const now: number = t0 + i * 30;
      const r = answerTiming({ ...base, prevStreak: streak, nowMs: now, prevAnsweredAtMs: prevAt, startedAtMs: t0, lastResumeAtMs: t0 });
      expect(r.withinTargetTime).toBe(false);
      streak = r.speedStreakLen;
      prevAt = now;
    }
    expect(streak).toBe(0);
  });
  it('computeTimings (EXAM) memakai batas yang sama', () => {
    const r = computeTimings(
      [
        { answeredAtMs: t0 + 500, isCorrect: true, targetMs: 10_000 },
        { answeredAtMs: t0 + 4500, isCorrect: true, targetMs: 10_000 },
      ],
      t0,
      t0,
    );
    expect(r.map((x) => x.withinTargetTime)).toEqual([false, true]);
    expect(r[1]!.speedStreakLen).toBe(1);
  });
});
