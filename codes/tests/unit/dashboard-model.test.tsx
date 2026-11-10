/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  buildCrownCollection,
  buildTargetBandState,
  buildTierProgress,
  crownForAccuracy,
  findWeakArea,
  isDailyTargetDone,
  weakAreaHref,
} from '@/lib/dashboard';
import { CrownCollectionGrid } from '@/components/dashboard/crown-collection-grid';
import { TargetBandCard } from '@/components/dashboard/target-band-card';
import { TierProgressCard } from '@/components/dashboard/tier-progress-card';
import { RecentExamHistory } from '@/components/dashboard/recent-exam-history';
import { StreakHero } from '@/components/dashboard/streak-hero';
import type { TierNode } from '@/contracts/curriculum';
import type { SkillRadarItemDTO } from '@/contracts/skills';

const skill = (s: SkillRadarItemDTO['skill'], pct: number | null, n = 3): SkillRadarItemDTO => ({
  skill: s, score_percent: pct, estimated_band: null, sample_size: n, is_proxy: false, updated_at: null,
});

const tier = (n: number, status: TierNode['status'], pct: number, skipAvail: boolean, scores: number[]): TierNode =>
  ({
    id: `t${n}`, tier_number: n, title: `Tier ${n}`, cefr_level: 'A2', target_band_min: 4, target_band_max: 5, status,
    unlock_source: null, progress_percent: pct,
    boss: {} as never,
    skip_test: { available: skipAvail, assessment_set_id: null, threshold_percent: 80, time_limit_seconds: null, question_count: null },
    modules: [{ sub_modules: scores.map((x) => ({ best_score_percent: x })) }],
  }) as unknown as TierNode;

describe('crown bands (C-15)', () => {
  it('memetakan akurasi ke 4 tingkat pada batas persis', () => {
    expect(crownForAccuracy(59)).toBe('NONE');
    expect(crownForAccuracy(60)).toBe('BRONZE');
    expect(crownForAccuracy(74)).toBe('BRONZE');
    expect(crownForAccuracy(75)).toBe('SILVER');
    expect(crownForAccuracy(89)).toBe('SILVER');
    expect(crownForAccuracy(90)).toBe('GOLD');
  });
  it('koleksi hanya menghitung sub-modul bernilai > 0', () => {
    const c = buildCrownCollection([tier(1, 'IN_PROGRESS', 10, false, [0, 50, 65, 80, 95, 100])]);
    expect(c.attempted).toBe(5);
    expect(c.counts).toEqual({ NONE: 1, BRONZE: 1, SILVER: 1, GOLD: 2 });
  });
});

describe('model dashboard', () => {
  it('tier terurut, badge Skip Test hanya bila belum selesai dan tersedia', () => {
    const p = buildTierProgress([
      tier(2, 'LOCKED', 0, true, []),
      tier(1, 'COMPLETED', 100, true, []),
      tier(3, 'UNLOCKED', 5, false, []),
    ]);
    expect(p.map((t) => t.tier_number)).toEqual([1, 2, 3]);
    expect(p.map((t) => t.skip_test_available)).toEqual([false, true, false]);
    expect(p[1]!.locked).toBe(true);
  });
  it('area lemah = skor terendah dengan data; null bila belum ada data', () => {
    expect(findWeakArea([skill('LISTENING', 80), skill('WRITING', 40), skill('READING', 10, 0)])?.skill).toBe('WRITING');
    expect(findWeakArea([skill('LISTENING', null, 0)])).toBeNull();
    expect(weakAreaHref('GRAMMAR')).toBe('/latihan/campur');
    expect(weakAreaHref('READING')).toBe('/peta');
  });
  it('target harian selesai bila aktivitas terakhir hari ini', () => {
    const now = new Date(2026, 10, 10, 9, 0);
    expect(isDailyTargetDone('2026-11-10', now)).toBe(true);
    expect(isDailyTargetDone('2026-11-09', now)).toBe(false);
    expect(isDailyTargetDone(null, now)).toBe(false);
  });
  it('Target Band: tiga kondisi', () => {
    expect(buildTargetBandState(null, 5)).toEqual({ kind: 'NO_TARGET' });
    expect(buildTargetBandState(7, null)).toEqual({ kind: 'NO_PREDICTION', target: 7 });
    expect(buildTargetBandState(7, 5.5)).toMatchObject({ kind: 'TRACKING', gap: 1.5, reached: false });
    expect(buildTargetBandState(6, 6.5)).toMatchObject({ gap: 0, reached: true });
  });
});

describe('komponen dashboard', () => {
  afterEach(cleanup);
  it('menampilkan skeleton saat memuat dan empty state', () => {
    const { rerender } = render(<CrownCollectionGrid collection={null} loading />);
    expect(screen.getByRole('status')).toBeTruthy();
    rerender(<CrownCollectionGrid collection={{ counts: { NONE: 0, BRONZE: 0, SILVER: 0, GOLD: 0 }, attempted: 0 }} />);
    expect(screen.getByTestId('dash-crowns-empty')).toBeTruthy();
    expect(screen.getByTestId('dash-crown-GOLD').textContent).toContain('Emas');
  });
  it('TargetBandCard dua kondisi isi', () => {
    const { rerender } = render(<TargetBandCard state={{ kind: 'NO_PREDICTION', target: 7 }} />);
    expect(screen.getByText(/estimasi band/i)).toBeTruthy();
    rerender(<TargetBandCard state={{ kind: 'TRACKING', target: 7, current: 5.5, gap: 1.5, reached: false }} />);
    expect(screen.getByTestId('dash-band-current').textContent).toBe('5.5');
    expect(screen.getByText(/Kurang 1.5 band/)).toBeTruthy();
  });
  it('TierProgressCard menampilkan badge Skip Test', () => {
    render(<TierProgressCard tiers={buildTierProgress([tier(1, 'UNLOCKED', 20, true, [])])} />);
    expect(screen.getByText('Skip Test')).toBeTruthy();
    expect(screen.getByTestId('dash-tier-1')).toBeTruthy();
  });
  it('RecentExamHistory: maksimal 3, antrean AI, dan empty state', () => {
    const mk = (i: number, status: string) => ({
      attempt_id: `a${i}`, assessment_type: 'TIER_BOSS_EXAM', title: `Ujian ${i}`, status,
      score_percent: 70, band_score: null, passed: true, submitted_at: '2026-11-10T01:00:00Z', result_path: `/ujian/a${i}/hasil`,
    });
    const { rerender } = render(<RecentExamHistory items={[mk(1, 'GRADED'), mk(2, 'AWAITING_GRADING'), mk(3, 'GRADED'), mk(4, 'GRADED')]} />);
    expect(screen.queryByText('Ujian 4')).toBeNull();
    expect(screen.getByTestId('dash-ai-queue').textContent).toContain('1 hasil');
    rerender(<RecentExamHistory items={[]} />);
    expect(screen.getByTestId('dash-exams-empty')).toBeTruthy();
  });
  it('StreakHero: target harian', () => {
    render(<StreakHero data={{ streakDays: 4, longestStreak: 9, totalPoints: 1200, dailyTargetDone: false, streakAtRisk: true }} />);
    expect(screen.getByTestId('dash-streak-days').textContent).toBe('4 hari');
    expect(screen.getByTestId('dash-daily-target').textContent).toContain('streak tidak putus');
  });
});
