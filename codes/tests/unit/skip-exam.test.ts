import { describe, expect, it } from 'vitest';
import { assertGateOpen, formatClock, resolveSkipTarget } from '@/server/exams/skip';
import { secondsUntil, type AttemptGate } from '@/server/exams/gate';
import type { ModuleNode, Snapshot, SubNode, TierNode } from '@/server/gatekeeping/rules';
import { ApiError } from '@/server/http/errors';

const sub = (id: string, status: SubNode['status'], review: SubNode['review'] = 'PUBLISHED'): SubNode =>
  ({ kind: 'SUB_MODULE', id, moduleId: 'm1', code: id, title: id, passing: 75, order: 1, review, drillPass: null, hasMiniTask: false, status, unlockSource: null, learnCompleted: false, miniTaskCompleted: false, crown: 'NONE', best: 0, attempts: 0, completedAt: null }) as SubNode;
const mod = (id: string, status: ModuleNode['status'], subs: SubNode[], review: ModuleNode['review'] = 'PUBLISHED'): ModuleNode =>
  ({ kind: 'MODULE', id, tierId: 't1', code: '2.1', skill: 'GRAMMAR', title: 'Complex Grammar', order: 1, review, status, unlockSource: null, skipBest: null, completedAt: null, subs }) as ModuleNode;
const tier = (status: TierNode['status'], modules: ModuleNode[]): TierNode =>
  ({ kind: 'TIER', id: 't1', number: 2, title: 'Bridge', cefr: 'B1', bandMin: 4, bandMax: 5, gateType: 'PERCENT', gateValue: 80, skipThreshold: 85, status, unlockSource: null, bossBestPercent: null, bossBestBand: null, bossPassedAt: null, completedAt: null, modules }) as TierNode;
const snap = (t: TierNode): Snapshot => ({ tiers: [t], origin: new Map(), dirty: new Set() });

describe('resolveSkipTarget (D1)', () => {
  it('modul LOCKED tanpa sub-modul dimulai: eligible, label dan ambang dari Tier', () => {
    const s = snap(tier('LOCKED', [mod('m1', 'LOCKED', [sub('a', 'LOCKED'), sub('b', 'LOCKED')])]));
    const t = resolveSkipTarget(s, { assessmentType: 'SKIP_MODULE_TEST', moduleId: 'm1', tierId: null })!;
    expect(t).toMatchObject({ scope: 'MODULE', id: 'm1', label: 'Modul 2.1 Complex Grammar', thresholdPercent: 85, available: true, eligible: true });
    expect(t.subs).toHaveLength(2);
  });

  it('satu sub-modul IN_PROGRESS: tidak eligible walau status modul masih UNLOCKED', () => {
    const s = snap(tier('UNLOCKED', [mod('m1', 'UNLOCKED', [sub('a', 'IN_PROGRESS'), sub('b', 'LOCKED')])]));
    expect(resolveSkipTarget(s, { assessmentType: 'SKIP_MODULE_TEST', moduleId: 'm1', tierId: null })!.eligible).toBe(false);
  });

  it.each(['COMPLETED', 'SKIPPED'] as const)('sub-modul %s: tidak eligible', (st) => {
    const s = snap(tier('UNLOCKED', [mod('m1', 'UNLOCKED', [sub('a', st)])]));
    expect(resolveSkipTarget(s, { assessmentType: 'SKIP_MODULE_TEST', moduleId: 'm1', tierId: null })!.eligible).toBe(false);
  });

  it('modul tanpa sub-modul PUBLISHED: tidak available (404 pada start)', () => {
    const s = snap(tier('LOCKED', [mod('m1', 'LOCKED', [sub('a', 'LOCKED', 'DRAFT')])]));
    expect(resolveSkipTarget(s, { assessmentType: 'SKIP_MODULE_TEST', moduleId: 'm1', tierId: null })!.available).toBe(false);
  });

  it('modul DRAFT: tidak available', () => {
    const s = snap(tier('LOCKED', [mod('m1', 'LOCKED', [sub('a', 'LOCKED')], 'DRAFT')]));
    expect(resolveSkipTarget(s, { assessmentType: 'SKIP_MODULE_TEST', moduleId: 'm1', tierId: null })!.available).toBe(false);
  });

  it('Tier: eligible hanya bila LOCKED/UNLOCKED dan tidak ada yang dimulai', () => {
    const ok = snap(tier('LOCKED', [mod('m1', 'LOCKED', [sub('a', 'LOCKED')])]));
    expect(resolveSkipTarget(ok, { assessmentType: 'SKIP_TIER_TEST', moduleId: null, tierId: 't1' })).toMatchObject({ scope: 'TIER', label: 'Tier 2: Bridge', eligible: true });
    const started = snap(tier('IN_PROGRESS', [mod('m1', 'IN_PROGRESS', [sub('a', 'IN_PROGRESS')])]));
    expect(resolveSkipTarget(started, { assessmentType: 'SKIP_TIER_TEST', moduleId: null, tierId: 't1' })!.eligible).toBe(false);
  });

  it('scope tidak cocok / tidak ada -> null', () => {
    const s = snap(tier('LOCKED', [mod('m1', 'LOCKED', [sub('a', 'LOCKED')])]));
    expect(resolveSkipTarget(s, { assessmentType: 'SKIP_MODULE_TEST', moduleId: 'zzz', tierId: null })).toBeNull();
    expect(resolveSkipTarget(s, { assessmentType: 'SKIP_MODULE_TEST', moduleId: null, tierId: 't1' })).toBeNull();
    expect(resolveSkipTarget(s, { assessmentType: 'ACTIVE_DRILL', moduleId: null, tierId: null })).toBeNull();
  });
});

describe('assertGateOpen (D5 langkah 4-5)', () => {
  const now = new Date('2026-11-03T10:00:00.000Z');
  const base: AttemptGate = { cooldownMinutes: 60, maxPerDay: 3, cooldownUntil: null, attemptsInWindow: 0, dailyBlocked: false, dailyRetryAt: null };

  it('terbuka bila tidak ada cooldown/limit', () => {
    expect(() => assertGateOpen(base, now)).not.toThrow();
  });

  it('cooldown: 429 + Retry-After + details ISO + pesan WIB', () => {
    const until = new Date('2026-11-03T10:50:00.000Z');
    try {
      assertGateOpen({ ...base, cooldownUntil: until }, now);
      expect.unreachable();
    } catch (e) {
      const err = e as ApiError;
      expect(err.code).toBe('COOLDOWN_ACTIVE');
      expect(err.status).toBe(429);
      expect(err.headers?.['Retry-After']).toBe('3000');
      expect(err.details).toEqual([{ path: 'next_allowed_at', code: 'cooldown_active', message: '2026-11-03T10:50:00.000Z' }]);
      expect(err.message).toBe('Anda dapat mencoba lagi pukul 17:50 WIB.');
    }
  });

  it('cooldown didahulukan atas batas harian', () => {
    const until = new Date(now.getTime() + 1000);
    expect(() => assertGateOpen({ ...base, cooldownUntil: until, dailyBlocked: true }, now)).toThrowError(expect.objectContaining({ code: 'COOLDOWN_ACTIVE' }));
  });

  it('batas harian: 429 DAILY_ATTEMPT_LIMIT dengan Retry-After', () => {
    try {
      assertGateOpen({ ...base, dailyBlocked: true, attemptsInWindow: 3, dailyRetryAt: new Date(now.getTime() + 7200_000) }, now);
      expect.unreachable();
    } catch (e) {
      const err = e as ApiError;
      expect(err.code).toBe('DAILY_ATTEMPT_LIMIT');
      expect(err.status).toBe(429);
      expect(err.headers?.['Retry-After']).toBe('7200');
      expect(err.message).toBe('Batas percobaan harian untuk ujian ini sudah tercapai.');
    }
  });
});

describe('util waktu', () => {
  it('secondsUntil membulat ke atas dan minimal 1', () => {
    const now = new Date('2026-11-03T10:00:00.000Z');
    expect(secondsUntil(new Date(now.getTime() + 1500), now)).toBe(2);
    expect(secondsUntil(new Date(now.getTime() - 5000), now)).toBe(1);
  });
  it('formatClock memakai zona dan label', () => {
    const d = new Date('2026-11-03T11:30:00.000Z');
    expect(formatClock(d, 'Asia/Jakarta')).toBe('18:30 WIB');
    expect(formatClock(d, 'Asia/Makassar')).toBe('19:30 WITA');
  });
});
