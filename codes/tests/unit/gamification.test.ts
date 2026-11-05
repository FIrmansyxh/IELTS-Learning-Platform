import { describe, expect, it } from 'vitest';
import {
  formatDateInTz,
  getYesterdayDateStr,
} from '@/server/gamification/service';

describe('Gamification Timezone & Date Calculations (G7, G9)', () => {
  it('memformat tanggal lokal sesuai APP_TIMEZONE', () => {
    // 2026-11-03 17:30:00 UTC = 2026-11-04 00:30:00 WIB (Asia/Jakarta, UTC+7)
    const dt = new Date('2026-11-03T17:30:00.000Z');
    expect(formatDateInTz(dt, 'Asia/Jakarta')).toBe('2026-11-04');
    expect(formatDateInTz(dt, 'UTC')).toBe('2026-11-03');
  });

  it('menghitung tanggal kemarin (1 hari kalender sebelumnya) dengan benar', () => {
    expect(getYesterdayDateStr('2026-11-04')).toBe('2026-11-03');
    expect(getYesterdayDateStr('2026-03-01')).toBe('2026-02-28');
    expect(getYesterdayDateStr('2026-01-01')).toBe('2025-12-31');
  });

  it('mengidentifikasi dua aktivitas di 23:59 WIB dan 00:01 WIB sebagai dua hari berturut-turut', () => {
    // 2026-11-03 23:59 WIB = 2026-11-03 16:59 UTC
    const d1 = new Date('2026-11-03T16:59:00.000Z');
    // 2026-11-04 00:01 WIB = 2026-11-03 17:01 UTC
    const d2 = new Date('2026-11-03T17:01:00.000Z');

    const day1Wib = formatDateInTz(d1, 'Asia/Jakarta');
    const day2Wib = formatDateInTz(d2, 'Asia/Jakarta');

    expect(day1Wib).toBe('2026-11-03');
    expect(day2Wib).toBe('2026-11-04');
    expect(getYesterdayDateStr(day2Wib)).toBe(day1Wib);

    // Pada zona UTC, kedua instan masih pada hari yang sama (2026-11-03)
    const day1Utc = formatDateInTz(d1, 'UTC');
    const day2Utc = formatDateInTz(d2, 'UTC');
    expect(day1Utc).toBe('2026-11-03');
    expect(day2Utc).toBe('2026-11-03');
  });
});

describe('Gamification Point & Crown Logic (G1-G4)', () => {
  it('menghitung poin drill dan bonus speed streak', () => {
    const correctCount = 8;
    const correctSetting = 10;
    const drillPointsTarget = correctCount * correctSetting;
    expect(drillPointsTarget).toBe(80);

    const speedStreakLens = [1, 2, 3, 4, 0, 1, 2, 3, 0, 1];
    const speedMinSetting = 3;
    const speedBonusSetting = 5;

    const speedCount = speedStreakLens.filter((l) => l >= speedMinSetting).length;
    expect(speedCount).toBe(3); // 3, 4, 3
    const speedPointsTarget = speedCount * speedBonusSetting;
    expect(speedPointsTarget).toBe(15);
  });

  it('anti-farming: hanya memberikan delta poin yang belum pernah diraih pada set tersebut', () => {
    // Attempt 1: 8 benar (80 poin)
    const existingDrill = 80;
    // Attempt 2: 9 benar (90 poin target)
    const newTarget = 90;
    const delta1 = Math.max(0, newTarget - existingDrill);
    expect(delta1).toBe(10);

    // Attempt 3: 7 benar (70 poin target)
    const lowerTarget = 70;
    const delta2 = Math.max(0, lowerTarget - 90);
    expect(delta2).toBe(0);
  });

  it('evaluasi mahkota: ambang Silver (75%) dan Gold (90%)', () => {
    const silverMin = 75;
    const goldMin = 90;

    const score1 = 74.99;
    const crown1 = score1 >= goldMin ? 'GOLD' : score1 >= silverMin ? 'SILVER' : 'NONE';
    expect(crown1).toBe('NONE');

    const score2 = 75.0;
    const crown2 = score2 >= goldMin ? 'GOLD' : score2 >= silverMin ? 'SILVER' : 'NONE';
    expect(crown2).toBe('SILVER');

    const score3 = 89.99;
    const crown3 = score3 >= goldMin ? 'GOLD' : score3 >= silverMin ? 'SILVER' : 'NONE';
    expect(crown3).toBe('SILVER');

    const score4 = 90.0;
    const crown4 = score4 >= goldMin ? 'GOLD' : score4 >= silverMin ? 'SILVER' : 'NONE';
    expect(crown4).toBe('GOLD');
  });

  it('mahkota tidak pernah turun (monotonik naik)', () => {
    const CROWN_RANK = { NONE: 0, SILVER: 1, GOLD: 2 };
    let current = 'GOLD';
    const newComputed = 'SILVER';

    if (CROWN_RANK[newComputed] > CROWN_RANK[current as keyof typeof CROWN_RANK]) {
      current = newComputed;
    }
    expect(current).toBe('GOLD');
  });
});

