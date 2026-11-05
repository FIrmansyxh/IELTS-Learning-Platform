import { describe, expect, it } from 'vitest';
import {
  matchesSkill,
  countsTowardGate,
  buildBossRules,
  formatSectionDTO,
  refreshBossResult,
} from '@/server/exams/boss';
import { bossBand, overallBand, convertRawToBand, scaleToForty } from '@/server/band/convert';
import { LISTENING_SEED_ROWS, READING_ACADEMIC_SEED_ROWS } from '@/server/band/seed-data';
import type { BossResultDTO } from '@/contracts/exams';
import type { AssessmentSetRow } from '@/server/exams/boss';

describe('matchesSkill helper', () => {
  it('mencocokkan jenis submission Writing dengan skill WRITING', () => {
    expect(matchesSkill('WRITING_TASK1', 'WRITING')).toBe(true);
    expect(matchesSkill('WRITING_TASK2', 'WRITING')).toBe(true);
    expect(matchesSkill('MINI_TASK_WRITING', 'WRITING')).toBe(true);
    expect(matchesSkill('SPEAKING_PART1', 'WRITING')).toBe(false);
  });

  it('mencocokkan jenis submission Speaking dengan skill SPEAKING', () => {
    expect(matchesSkill('SPEAKING_PART1', 'SPEAKING')).toBe(true);
    expect(matchesSkill('SPEAKING_PART2', 'SPEAKING')).toBe(true);
    expect(matchesSkill('SPEAKING_PART3', 'SPEAKING')).toBe(true);
    expect(matchesSkill('MINI_TASK_SPEAKING', 'SPEAKING')).toBe(true);
    expect(matchesSkill('WRITING_TASK1', 'SPEAKING')).toBe(false);
  });
});

describe('countsTowardGate (D6)', () => {
  it('hanya Listening dan Reading yang menentukan kelulusan gerbang Boss Stage', () => {
    expect(countsTowardGate('LISTENING')).toBe(true);
    expect(countsTowardGate('READING')).toBe(true);
    expect(countsTowardGate('WRITING')).toBe(false);
    expect(countsTowardGate('SPEAKING')).toBe(false);
  });
});

describe('buildBossRules', () => {
  it('menyusun aturan evaluasi gerbang PERCENT untuk Tier 1', () => {
    const rules = buildBossRules('PERCENT', 80, 7200, {
      cooldownMinutes: 60,
      maxPerDay: 2,
      cooldownUntil: null,
      attemptsInWindow: 0,
      dailyBlocked: false,
      dailyRetryAt: null,
    });
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some((r) => r.includes('80%'))).toBe(true);
    expect(rules.some((r) => r.includes('Listening + Reading'))).toBe(true);
  });

  it('menyusun aturan evaluasi gerbang BAND untuk Tier 2-4', () => {
    const rules = buildBossRules('BAND', 5.0, 7200, {
      cooldownMinutes: 120,
      maxPerDay: 2,
      cooldownUntil: null,
      attemptsInWindow: 0,
      dailyBlocked: false,
      dailyRetryAt: null,
    });
    expect(rules.some((r) => r.includes('5.0'))).toBe(true);
    expect(rules.some((r) => r.includes('advisory') || r.includes('masukan'))).toBe(true);
  });
});

describe('formatSectionDTO', () => {
  const dummyChild: AssessmentSetRow = {
    id: 'set-l1',
    parentSetId: 'boss-1',
    tierId: 't1',
    moduleId: null,
    subModuleId: null,
    skillCategory: 'LISTENING',
    assessmentType: 'BOSS_SECTION',
    title: 'Listening Section',
    timeLimitSeconds: 1800,
    readingPassageMarkdown: null,
    listeningAssetId: null,
    questionsJson: [],
    questionCount: 40,
    status: 'PUBLISHED',
  } as unknown as AssessmentSetRow;

  it('memformat section PENDING', () => {
    const dto = formatSectionDTO(dummyChild, undefined, new Date());
    expect(dto.phase).toBe('PENDING');
    expect(dto.counts_toward_gate).toBe(true);
    expect(dto.time_limit_seconds).toBe(1800);
    expect(dto.remaining_seconds).toBeNull();
  });

  it('menghitung sisa detik pada section ACTIVE', () => {
    const now = new Date('2026-11-04T10:00:00.000Z');
    const deadline = new Date('2026-11-04T10:15:00.000Z');
    const dto = formatSectionDTO(
      dummyChild,
      { phase: 'ACTIVE', started_at: now.toISOString(), deadline_at: deadline.toISOString() },
      now,
    );
    expect(dto.phase).toBe('ACTIVE');
    expect(dto.remaining_seconds).toBe(900);
  });
});

describe('Boss Stage Gate Evaluation Logic (D6)', () => {
  it('Tier 1 PERCENT Gate: ambang 80% poin mentah L+R', () => {
    const max = 40; // Total 20 L + 20 R
    const gateVal = 80;

    // L 16 + R 16 = 32 / 40 = 80.0% -> PASS
    const passRaw = 16 + 16;
    expect(passRaw * 100 >= gateVal * max).toBe(true);

    // L 15 + R 16 = 31 / 40 = 77.5% -> FAIL
    const failRaw = 15 + 16;
    expect(failRaw * 100 >= gateVal * max).toBe(false);
  });

  it('Tier 2 BAND Gate: ambang Band 5.0 (L 16 raw / 40 -> 5.0, R 15 raw / 40 -> 5.0)', () => {
    // 40 soal
    const lRaw40 = scaleToForty(16, 40); // 16
    const rRaw40 = scaleToForty(15, 40); // 15

    const lBand = convertRawToBand(LISTENING_SEED_ROWS, lRaw40);
    const rBand = convertRawToBand(READING_ACADEMIC_SEED_ROWS, rRaw40);

    const bBand = bossBand(lBand, rBand);
    expect(bBand).toBeGreaterThanOrEqual(5.0);

    // Gagal: L 13 raw / 40 -> band 4.5, R 13 raw / 40 -> band 4.5
    const failL40 = scaleToForty(13, 40);
    const failR40 = scaleToForty(13, 40);
    const failLBand = convertRawToBand(LISTENING_SEED_ROWS, failL40);
    const failRBand = convertRawToBand(READING_ACADEMIC_SEED_ROWS, failR40);
    const failBBand = bossBand(failLBand, failRBand);
    expect(failBBand).toBeLessThan(5.0);
  });

  it('Tier 3 BAND Gate: ambang Band 6.0', () => {
    // L band 6.0, R band 6.0 -> 6.0 PASS
    expect(bossBand(6.0, 6.0)).toBe(6.0);
    // L band 5.5, R band 6.0 -> 5.75 dibulatkan ke 6.0 PASS
    expect(bossBand(5.5, 6.0)).toBe(6.0);
    // L band 5.5, R band 5.5 -> 5.5 FAIL
    expect(bossBand(5.5, 5.5)).toBeLessThan(6.0);
  });

  it('Tier 4 BAND Gate: ambang Band 7.0', () => {
    // L band 7.0, R band 7.0 -> 7.0 PASS
    expect(bossBand(7.0, 7.0)).toBe(7.0);
    // L band 6.5, R band 7.0 -> 6.75 -> 7.0 PASS
    expect(bossBand(6.5, 7.0)).toBe(7.0);
    // L band 6.5, R band 6.5 -> 6.5 FAIL
    expect(bossBand(6.5, 6.5)).toBeLessThan(7.0);
  });

  it('Writing & Speaking bersifat Advisory (tidak membatalkan kelulusan & tidak meluluskan yang gagal)', () => {
    // Kasus 1: L/R gagal (Band 4.5), W/S tinggi (Band 8.0 & 8.5) -> tetap FAIL karena gerbang hanya dari L & R
    const lBand = 4.5;
    const rBand = 4.5;
    const bBand = bossBand(lBand, rBand);
    const passed = bBand >= 5.0;
    expect(passed).toBe(false);

    // Kasus 2: L/R lulus (Band 6.0), W/S rendah (Band 3.5 & 4.0) -> tetap PASS
    const passL = 6.0;
    const passR = 6.0;
    const passBBand = bossBand(passL, passR);
    const passResult = passBBand >= 6.0;
    expect(passResult).toBe(true);
  });
});

describe('refreshBossResult & overall_band_estimate (D8)', () => {
  const dummyBoss: BossResultDTO = {
    passed: true,
    gate: { type: 'BAND', value: 6.0 },
    percent: 75,
    boss_band: 6.0,
    sections: [
      {
        skill: 'LISTENING',
        raw_score: 24,
        max_score: 40,
        raw_40: 24,
        band: 6.0,
        status: 'SUBMITTED',
        submission_ids: [],
        counts_toward_gate: true,
      },
      {
        skill: 'READING',
        raw_score: 25,
        max_score: 40,
        raw_40: 25,
        band: 6.0,
        status: 'SUBMITTED',
        submission_ids: [],
        counts_toward_gate: true,
      },
      {
        skill: 'WRITING',
        raw_score: null,
        max_score: null,
        raw_40: null,
        band: null,
        status: 'SUBMITTED',
        submission_ids: ['sub-w'],
        counts_toward_gate: false,
      },
      {
        skill: 'SPEAKING',
        raw_score: null,
        max_score: null,
        raw_40: null,
        band: null,
        status: 'SUBMITTED',
        submission_ids: ['sub-s'],
        counts_toward_gate: false,
      },
    ],
    overall_band_estimate: null,
    pending_ai: 2,
    band_table_ids: {
      listening: '11111111-1111-1111-1111-111111111111',
      reading_academic: '22222222-2222-2222-2222-222222222222',
    },
    tier: { id: '33333333-3333-3333-3333-333333333333', tier_number: 3 },
    next_tier_unlocked: true,
    unlocked: [],
    retry: { next_allowed_at: null, attempts_remaining_today: 2 },
    disclaimer: 'Advisory',
  };

  it('overall_band_estimate bernilai null jika W atau S belum selesai dinilai AI', async () => {
    const dummyAttempt = {
      id: 'att-boss-1',
      assessmentSetId: 'boss-set-1',
    };

    const dummyChildSections = [
      { id: 'sec-w', skillCategory: 'WRITING' },
      { id: 'sec-s', skillCategory: 'SPEAKING' },
    ];

    interface MockQb extends PromiseLike<unknown[]> {
      orderBy: () => MockQb;
      limit: () => Promise<unknown[]>;
    }

    const makeQb = (data: unknown[] = []): MockQb => {
      const p = Promise.resolve(data);
      const qb: MockQb = {
        then: p.then.bind(p),
        orderBy: () => qb,
        limit: () => p,
      };
      return qb;
    };

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => {
            return makeQb(dummyChildSections);
          },
        }),
      }),
    };

    const refreshed = await refreshBossResult(mockDb as never, dummyAttempt as never, dummyBoss);
    expect(refreshed.overall_band_estimate).toBeNull();
  });

  it('menghitung overallBand ketika keempat skill telah memiliki skor band valid', () => {
    const l = 6.0;
    const r = 6.0;
    const w = 6.5;
    const s = 6.5;
    const est = overallBand({ listening: l, reading: r, writing: w, speaking: s });
    expect(est).toBe(6.5);
  });
});
