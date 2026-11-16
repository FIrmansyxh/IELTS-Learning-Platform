import { describe, expect, it } from 'vitest';
import {
  bossState,
  chainOf,
  lockReasonOf,
  moduleProgressPercent,
  recompute,
  setStatus,
  subProgressPercent,
  tierProgressPercent,
  type ModuleNode,
  type Review,
  type Snapshot,
  type Status,
  type SubNode,
  type TierNode,
} from '@/server/gatekeeping/rules';
import { toHundredths } from '@/server/gatekeeping/service';

let n = 0;
const sub = (code: string, order: number, over: Partial<SubNode> = {}): SubNode => ({
  kind: 'SUB_MODULE', id: `s${++n}`, moduleId: '', code, title: `Sub ${code}`, passing: 75, order, review: 'PUBLISHED',
  drillPass: null, hasMiniTask: false, status: 'LOCKED', unlockSource: null, learnCompleted: false, miniTaskCompleted: false,
  crown: 'NONE', best: 0, attempts: 0, completedAt: null, ...over,
});
const mod = (code: string, order: number, subs: SubNode[], review: Review = 'PUBLISHED', over: Partial<ModuleNode> = {}): ModuleNode => {
  const m: ModuleNode = { kind: 'MODULE', id: `m${++n}`, tierId: '', code, skill: 'GRAMMAR', title: `Modul ${code}`, order, review, status: 'LOCKED', unlockSource: null, skipBest: null, completedAt: null, subs, ...over };
  subs.forEach((s) => (s.moduleId = m.id));
  return m;
};
const tierN = (number: number, modules: ModuleNode[], over: Partial<TierNode> = {}): TierNode => ({
  kind: 'TIER', id: `t${number}`, number, title: `Tier ${number}`, cefr: 'A1', bandMin: 3, bandMax: 4, gateType: 'PERCENT', gateValue: 80,
  skipThreshold: 85, status: 'LOCKED', unlockSource: null, bossBestPercent: null, bossBestBand: null, bossPassedAt: null, completedAt: null, modules, ...over,
});
const snap = (...tiers: TierNode[]): Snapshot => ({ tiers, origin: new Map(), dirty: new Set() });
const st = (s: SubNode) => s.status;

describe('recompute (D4-D6)', () => {
  it('Tier 1 dibuka DEFAULT; sub pertama UNLOCKED; berikutnya LOCKED; Tier 2 tetap LOCKED', () => {
    const a = sub('1.1.1', 1), b = sub('1.1.2', 2), c = sub('2.1.1', 1);
    const s = snap(tierN(1, [mod('1.1', 1, [a, b])]), tierN(2, [mod('2.1', 1, [c])]));
    recompute(s);
    expect([st(a), st(b), st(c)]).toEqual(['UNLOCKED', 'LOCKED', 'LOCKED']);
    expect(a.unlockSource).toBe('DEFAULT');
    expect(s.tiers[0]!.status).toBe('UNLOCKED');
    expect(s.tiers[1]!.status).toBe('LOCKED');
  });

  it('rantai melewati sub-modul tidak AVAILABLE dan lintas modul; modul draft diabaikan', () => {
    const a = sub('1.1.1', 1, { status: 'COMPLETED' });
    const draft = sub('1.1.2', 2, { review: 'DRAFT' });
    const c = sub('1.1.3', 3);
    const d = sub('1.2.1', 1);
    const hidden = sub('1.3.1', 1);
    const t = tierN(1, [mod('1.1', 1, [a, draft, c]), mod('1.2', 2, [d]), mod('1.3', 3, [hidden], 'DRAFT')]);
    expect(chainOf(t).map((x) => x.sub.code)).toEqual(['1.1.1', '1.1.3', '1.2.1']);
    const s = snap(t);
    recompute(s);
    expect(c.status).toBe('UNLOCKED');
    expect(c.unlockSource).toBe('SEQUENTIAL');
    expect(d.status).toBe('LOCKED');
    expect(hidden.status).toBe('LOCKED');
    c.status = 'COMPLETED';
    recompute(s);
    expect(d.status).toBe('UNLOCKED');
  });

  it('status tidak pernah turun: COMPLETED/SKIPPED lengket; modul IN_PROGRESS tidak turun ke UNLOCKED', () => {
    const a = sub('1.1.1', 1, { status: 'COMPLETED' });
    const b = sub('1.1.2', 2, { status: 'SKIPPED' });
    const m = mod('1.1', 1, [a, b], 'PUBLISHED', { status: 'COMPLETED' });
    const s = snap(tierN(1, [m], { status: 'IN_PROGRESS' }));
    s.tiers[0]!.modules[0]!.subs.push(sub('1.1.3', 3));
    recompute(s);
    expect(m.status).toBe('COMPLETED');
    expect(s.tiers[0]!.status).toBe('IN_PROGRESS');
    const x = sub('1.1.1', 1, { status: 'UNLOCKED' });
    const m2 = mod('1.1', 1, [x], 'PUBLISHED', { status: 'IN_PROGRESS' });
    recompute(snap(tierN(1, [m2])));
    expect(m2.status).toBe('IN_PROGRESS');
  });

  it('modul: semua SKIPPED -> SKIPPED; campuran -> COMPLETED; sebagian -> IN_PROGRESS; tanpa sub AVAILABLE -> tetap LOCKED', () => {
    const mk = (statuses: Status[]) => {
      const m = mod('1.1', 1, statuses.map((x, i) => sub(`1.1.${i + 1}`, i + 1, { status: x })));
      recompute(snap(tierN(1, [m])));
      return m.status;
    };
    expect(mk(['SKIPPED', 'SKIPPED'])).toBe('SKIPPED');
    expect(mk(['SKIPPED', 'COMPLETED'])).toBe('COMPLETED');
    expect(mk(['COMPLETED', 'UNLOCKED'])).toBe('IN_PROGRESS');
    expect(mk(['UNLOCKED', 'LOCKED'])).toBe('UNLOCKED');
    const empty = mod('1.1', 1, [sub('1.1.1', 1, { review: 'DRAFT' })]);
    recompute(snap(tierN(1, [empty])));
    expect(empty.status).toBe('LOCKED');
  });

  it('Tier n>1: dibuka oleh COMPLETED (BOSS_PASS) atau SKIPPED (mewarisi sumber); COMPLETED butuh boss lulus', () => {
    const a = sub('1.1.1', 1, { status: 'COMPLETED' });
    const b = sub('2.1.1', 1);
    const t1 = tierN(1, [mod('1.1', 1, [a], 'PUBLISHED', { status: 'COMPLETED' })], { status: 'UNLOCKED' });
    const t2 = tierN(2, [mod('2.1', 1, [b])]);
    const s = snap(t1, t2);
    recompute(s);
    expect(t1.status).toBe('IN_PROGRESS'); // boss belum lulus: belum COMPLETED
    expect(t2.status).toBe('LOCKED');
    t1.bossPassedAt = new Date();
    recompute(s);
    expect(t1.status).toBe('COMPLETED');
    expect(t2).toMatchObject({ status: 'UNLOCKED', unlockSource: 'BOSS_PASS' });
    expect(b).toMatchObject({ status: 'UNLOCKED', unlockSource: 'BOSS_PASS' });

    const sk = tierN(1, [mod('1.1', 1, [sub('1.1.1', 1, { status: 'SKIPPED' })])], { status: 'SKIPPED', unlockSource: 'PLACEMENT' });
    const nx = tierN(2, [mod('2.1', 1, [sub('2.1.1', 1)])]);
    recompute(snap(sk, nx));
    expect(nx).toMatchObject({ status: 'UNLOCKED', unlockSource: 'PLACEMENT' });
  });

  it('sub yang dilewati di Tier terkunci membuka Tier (IN_PROGRESS) sesuai D6', () => {
    const skipped = sub('2.1.1', 1, { status: 'SKIPPED', unlockSource: 'SKIP_TEST' });
    const next = sub('2.2.1', 1);
    const t2 = tierN(2, [mod('2.1', 1, [skipped]), mod('2.2', 2, [next])]);
    recompute(snap(tierN(1, []), t2));
    expect(t2.status).toBe('IN_PROGRESS');
    expect(next.status).toBe('UNLOCKED');
  });

  it('idempoten: recompute kedua tidak menambah perubahan', () => {
    const s = snap(tierN(1, [mod('1.1', 1, [sub('1.1.1', 1), sub('1.1.2', 2)])]));
    recompute(s);
    const dirty = new Set(s.dirty);
    s.dirty.clear();
    recompute(s);
    expect(s.dirty.size).toBe(0);
    expect(dirty.size).toBeGreaterThan(0);
  });
});

describe('persentase, boss, alasan terkunci', () => {
  it('D7: dengan/tanpa Mini-Task; selesai = 100; modul dan tier floor', () => {
    const base = sub('1.1.1', 1, { learnCompleted: true });
    expect(subProgressPercent(base)).toBe(50);
    expect(subProgressPercent({ ...base, best: 75 })).toBe(100);
    const withMini = { ...base, hasMiniTask: true };
    expect(subProgressPercent(withMini)).toBe(40);
    expect(subProgressPercent({ ...withMini, best: 80, miniTaskCompleted: true })).toBe(100);
    expect(subProgressPercent({ ...withMini, status: 'SKIPPED' })).toBe(100);
    expect(subProgressPercent({ ...base, best: 90, drillPass: 95 })).toBe(50); // pass override set
    const m = mod('1.1', 1, [sub('a', 1, { status: 'COMPLETED' }), sub('b', 2), sub('c', 3)]);
    expect(moduleProgressPercent(m)).toBe(33);
    expect(tierProgressPercent(tierN(1, [m]))).toBe(33);
    expect(tierProgressPercent(tierN(1, []))).toBe(0);
  });

  it('D7 (C-23): Modul/Tier terminal tetap menghitung sub-modul yang dipublikasikan belakangan', () => {
    const m = mod('1.1', 1, [sub('a', 1, { status: 'COMPLETED' }), sub('b', 2, { status: 'COMPLETED' }), sub('baru', 3, { status: 'UNLOCKED' })], 'PUBLISHED', { status: 'COMPLETED' });
    expect(moduleProgressPercent(m)).toBe(66);
    expect(tierProgressPercent(tierN(1, [m], { status: 'COMPLETED' }))).toBe(66);
    const full = mod('1.2', 2, [sub('c', 1, { status: 'SKIPPED' })], 'PUBLISHED', { status: 'SKIPPED' });
    expect(moduleProgressPercent(full)).toBe(100);
    expect(tierProgressPercent(tierN(1, [full], { status: 'SKIPPED' }))).toBe(100);
    // Tanpa sub-modul AVAILABLE: terminal = 100, lainnya = 0.
    expect(tierProgressPercent(tierN(1, [], { status: 'SKIPPED' }))).toBe(100);
    expect(moduleProgressPercent(mod('1.3', 3, [sub('d', 1, { review: 'DRAFT' })], 'PUBLISHED', { status: 'COMPLETED' }))).toBe(100);
  });

  it('D9: urutan prioritas alasan boss', () => {
    const done = mod('1.1', 1, [sub('a', 1, { status: 'COMPLETED' })], 'PUBLISHED', { status: 'COMPLETED' });
    const open = mod('1.1', 1, [sub('a', 1)]);
    expect(bossState(tierN(1, [done]), true)).toEqual({ available: false, blocked: 'TIER_LOCKED' });
    expect(bossState(tierN(1, [open], { status: 'UNLOCKED' }), true).blocked).toBe('MODULES_INCOMPLETE');
    expect(bossState(tierN(1, [done], { status: 'UNLOCKED' }), false).blocked).toBe('NO_BOSS_PUBLISHED');
    expect(bossState(tierN(1, [done], { status: 'IN_PROGRESS', bossPassedAt: new Date() }), true).blocked).toBe('ALREADY_PASSED');
    expect(bossState(tierN(1, [done], { status: 'IN_PROGRESS' }), true)).toEqual({ available: true, blocked: null });
    expect(bossState(tierN(1, [], { status: 'UNLOCKED' }), true).blocked).toBe('MODULES_INCOMPLETE');
  });

  it('lockReasonOf: NOT_PUBLISHED, TIER_LOCKED, PREVIOUS_INCOMPLETE; null bila tidak LOCKED', () => {
    const a = sub('1.1.1', 1, { status: 'UNLOCKED' });
    const b = sub('1.1.2', 2, { drillPass: 80 });
    const c = sub('1.1.3', 3, { review: 'DRAFT' });
    const m = mod('1.1', 1, [a, b, c]);
    const t = tierN(1, [m], { status: 'UNLOCKED' });
    expect(lockReasonOf(t, m, a)).toBeNull();
    expect(lockReasonOf(t, m, c)?.code).toBe('NOT_PUBLISHED');
    expect(lockReasonOf(t, m, b)).toMatchObject({ code: 'PREVIOUS_INCOMPLETE', blocking_sub_module_id: a.id });
    expect(lockReasonOf(tierN(2, [m], { status: 'LOCKED' }), m, b)?.message).toBe('Selesaikan Boss Stage Tier 1 atau ikuti Uji Kompetensi untuk membuka Tier ini.');
  });

  it('setStatus: monoton pada completed_at (sekali) dan menandai dirty hanya saat berubah', () => {
    const s = snap();
    const a = sub('1.1.1', 1);
    expect(setStatus(s, a, 'COMPLETED')).toBe(true);
    const first = a.completedAt;
    expect(first).not.toBeNull();
    s.dirty.clear();
    expect(setStatus(s, a, 'COMPLETED')).toBe(false);
    expect(a.completedAt).toBe(first);
    expect(s.dirty.size).toBe(0);
  });

  it('toHundredths: sentesimal tanpa kesalahan float; di luar rentang melempar', () => {
    expect(toHundredths(74.99)).toBe(7499);
    expect(toHundredths('75.00')).toBe(7500);
    expect(toHundredths(0.29)).toBe(29);
    expect(() => toHundredths(100.01)).toThrow();
    expect(() => toHundredths(-0.01)).toThrow();
    expect(() => toHundredths(Number.NaN)).toThrow();
    expect(() => toHundredths('x')).toThrow();
  });
});
