/**
 * SPEC-021 (Jalur Belajar): tes murni untuk AC yang sebelumnya tidak dirujuk tes mana pun.
 * AC-6 (bagian murni: guard 5 rute + gatekeeping per jalur), AC-13 (struktur berkas jalur), AC-14 (validator konten).
 * Bagian integrasi AC-6/8/9/13/15/19 ada di tests/integration/tracks-ac.itest.ts. Fixture sintetis.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseContentPackage, type ParseResult } from '@/server/content/validate';
import { applyTrackSequential, trackLockReasonOf, type TrackRef } from '@/server/gatekeeping/track';
import { recompute, type ModuleNode, type Snapshot, type SubNode, type TierNode } from '@/server/gatekeeping/rules';
import { subItem } from '../fixtures/content/builders';

// ---------------------------------------------------------------- AC-6
describe('AC-6: guard endpoint dan gatekeeping per jalur', () => {
  const API = path.join(process.cwd(), 'src', 'app', 'api', 'v1');
  const routes: Array<[string, string[]]> = [
    ['GET /tracks', ['tracks/route.ts', 'GET']],
    ['PUT /me/active-track', ['me/active-track/route.ts', 'PUT']],
    ['PUT /sub-modules/{code}/style', ['sub-modules/[sub_module]/style/route.ts', 'PUT']],
    ['POST /tracks/{track_code}/checkpoints/{item_id}/attempts', ['tracks/[track_code]/checkpoints/[item_id]/attempts/route.ts', 'POST']],
    ['GET /curriculum/tree (parameter track)', ['curriculum/tree/route.ts', 'GET']],
  ];

  for (const [name, [file, method]] of routes) {
    it(`AC-6: ${name} dibungkus withApi({ auth: 'user' }) sehingga menolak tanpa cookie`, () => {
      const src = readFileSync(path.join(API, file!), 'utf8');
      expect(src).toMatch(new RegExp(`export\\s+const\\s+${method}\\s*=\\s*withApi\\(`));
      expect(src).toMatch(/auth:\s*'user'/);
    });
  }

  // trackStatus (applyTrackSequential + trackLockReasonOf) per jalur, fixture sintetis
  let n = 0;
  const sub = (code: string, order: number, over: Partial<SubNode> = {}): SubNode => ({
    kind: 'SUB_MODULE', id: `s${++n}`, moduleId: '', code, title: `Sub ${code}`, passing: 75, order, review: 'PUBLISHED', drillPass: null,
    hasMiniTask: false, status: 'LOCKED', unlockSource: null, learnCompleted: false, miniTaskCompleted: false, crown: 'NONE', best: 0,
    attempts: 0, completedAt: null, ...over,
  });
  const mod = (code: string, subs: SubNode[]): ModuleNode => {
    const m: ModuleNode = {
      kind: 'MODULE', id: `m${++n}`, tierId: '', code, skill: 'GRAMMAR', title: `Modul ${code}`, order: 1, review: 'PUBLISHED',
      status: 'LOCKED', unlockSource: null, skipBest: null, completedAt: null, subs,
    };
    subs.forEach((s) => (s.moduleId = m.id));
    return m;
  };
  const tier = (number: number, modules: ModuleNode[], over: Partial<TierNode> = {}): TierNode => ({
    kind: 'TIER', id: `t${number}`, number, title: `Tier ${number}`, cefr: 'A1', bandMin: 3, bandMax: 4, gateType: 'PERCENT', gateValue: 80,
    skipThreshold: 85, status: 'LOCKED', unlockSource: null, bossBestPercent: null, bossBestBand: null, bossPassedAt: null, completedAt: null,
    modules, ...over,
  });
  const snap = (...tiers: TierNode[]): Snapshot => ({ tiers, origin: new Map(), dirty: new Set() });

  it('AC-6: gatekeeping per jalur (trackStatus): sekuensial di jalur CURATED, tidak menyentuh Tier LOCKED, dan alasan kunci per jalur', () => {
    const a = sub('1.1.1', 1, { status: 'COMPLETED', learnCompleted: true, best: 90 });
    const b = sub('1.1.2', 2);
    const c = sub('2.1.1', 1);
    const t1 = tier(1, [mod('1.1', [a, b])]);
    const t2 = tier(2, [mod('2.1', [c])]);
    const s = snap(t1, t2);
    recompute(s);
    const track: TrackRef = {
      id: 'trk', code: 'GT-WRITING', kind: 'CURATED',
      items: [
        { kind: 'SUB_MODULE', subModuleId: a.id, subModuleCode: a.code },
        { kind: 'CHECKPOINT' },
        { kind: 'SUB_MODULE', subModuleId: b.id, subModuleCode: b.code },
        { kind: 'SUB_MODULE', subModuleId: c.id, subModuleCode: c.code },
      ],
    };
    applyTrackSequential(s, track);
    expect(b.status).toBe('UNLOCKED');
    expect(b.unlockSource).toBe('SEQUENTIAL');
    expect(c.status).toBe('LOCKED'); // Tier 2 LOCKED: jalur tidak membukanya (D5.2)

    expect(trackLockReasonOf(t2, t2.modules[0]!, c, track, b)?.code).toBe('TIER_LOCKED');
    expect(trackLockReasonOf(t2, t2.modules[0]!, c, { id: 'x', code: 'GT-STRUCT', kind: 'CURRICULUM' }, null)?.code).toBe('TIER_LOCKED');
    expect(trackLockReasonOf(t1, t1.modules[0]!, b, track, a)).toBeNull(); // sudah UNLOCKED: tanpa alasan kunci
  });
});

// ---------------------------------------------------------------- AC-13 (struktur berkas, tanpa DB)
describe('AC-13: berkas GT-SPRINT-4W', () => {
  it('AC-13: tracks.json memuat 20 SUB_MODULE (minggu 1 hari 1 ... minggu 4 hari 5) dan 4 CHECKPOINT tepat sesudah hari ke-5', () => {
    const pkg = JSON.parse(readFileSync(path.resolve('content', 'gt-tracks', 'tracks.json'), 'utf8'));
    const t = pkg.learning_tracks.find((x: { track_code: string }) => x.track_code === 'GT-SPRINT-4W');
    expect(t.layout).toBe('SPRINT');
    expect(t.items).toHaveLength(24);
    const subs = t.items.filter((i: { kind: string }) => i.kind === 'SUB_MODULE');
    expect(subs.map((i: { week_no: number; day_no: number }) => [i.week_no, i.day_no])).toEqual(
      Array.from({ length: 20 }, (_, i) => [Math.floor(i / 5) + 1, (i % 5) + 1]),
    );
    t.items.forEach((it: { kind: string }, idx: number) => {
      if (it.kind === 'CHECKPOINT') expect(t.items[idx - 1].day_no).toBe(5);
    });
    expect(t.items.filter((i: { kind: string }) => i.kind === 'CHECKPOINT')).toHaveLength(4);
  });
});

// ---------------------------------------------------------------- AC-14
const codesOf = (r: ParseResult): string[] => (r.ok ? [] : r.errors.map((e) => e.code));
const S = (code: string, extra: Record<string, unknown> = {}) => ({ kind: 'SUB_MODULE', sub_module_code: code, ...extra });
const CP = { kind: 'CHECKPOINT' };

const track = (code: string, sort: number, items: unknown[], over: Record<string, unknown> = {}) => ({
  track_code: code,
  title: `Jalur ${code}`,
  description: 'Jalur sintetis untuk uji validator.',
  kind: 'CURATED',
  delivery_style_default: 'LEARN_FIRST',
  target_band_min: 5.5,
  target_band_max: 7,
  recommended_for: 'Uji',
  sort_order: sort,
  items,
  ...over,
});
const pkgOf = (tracks: unknown[]) => ({ contract_version: '1.2', learning_tracks: tracks });
/** Dasar valid: 4 sub-modul Tier 1 lalu Checkpoint. */
const base = (): unknown[] => [S('1.1.1'), S('1.1.2'), S('1.1.3'), S('1.1.4'), CP];

describe('AC-14: validator konten jalur (fixture positif dan satu fixture negatif per kode galat)', () => {
  const negatives: Array<[string, () => unknown]> = [
    ['duplicate_track_code', () => pkgOf([track('GT-A', 1, base()), track('GT-A', 2, base())])],
    ['duplicate_sort_order', () => pkgOf([track('GT-A', 1, base()), track('GT-B', 1, base())])],
    ['sub_module_not_found', () => pkgOf([track('GT-A', 1, [S('1.1.1'), S('1.1.2'), S('1.1.3'), S('4.9.9'), CP])])],
    ['sub_module_not_gt', () => pkgOf([track('GT-A', 1, [S('1.1.1'), S('1.1.2'), S('1.1.3'), S('3.3.1'), CP])])],
    ['duplicate_sub_module_in_track', () => pkgOf([track('GT-A', 1, [S('1.1.1'), S('1.1.2'), S('1.1.3'), S('1.1.3'), CP])])],
    ['tier_order_violation', () => pkgOf([track('GT-A', 1, [S('2.1.1'), S('2.1.2'), S('2.1.4'), S('1.1.1'), CP])])],
    ['checkpoint_first', () => pkgOf([track('GT-A', 1, [CP, ...base()])])],
    ['checkpoint_adjacent', () => pkgOf([track('GT-A', 1, [...base(), CP])])],
    ['checkpoint_last_required', () => pkgOf([track('GT-A', 1, [...base(), S('1.2.1')])])],
    ['checkpoint_group_size', () => pkgOf([track('GT-A', 1, [S('1.1.1'), S('1.1.2'), S('1.1.3'), CP, S('1.1.4'), S('2.1.1'), S('2.1.2'), S('2.1.4'), CP])])],
    [
      'sprint_slot_required',
      () =>
        pkgOf([
          track('GT-A', 1, [S('1.1.1', { week_no: 1, day_no: 1 }), S('1.1.2', { week_no: 1, day_no: 2 }), S('1.1.3', { week_no: 1, day_no: 3 }), S('1.1.4'), CP], { layout: 'SPRINT' }),
        ]),
    ],
    ['slot_not_allowed', () => pkgOf([track('GT-A', 1, [S('1.1.1', { week_no: 1, day_no: 1 }), S('1.1.2'), S('1.1.3'), S('1.1.4'), CP])])],
    [
      'sprint_slot_order',
      () =>
        pkgOf([
          track(
            'GT-A',
            1,
            [S('1.1.1', { week_no: 1, day_no: 1 }), S('1.1.2', { week_no: 1, day_no: 2 }), S('1.1.3', { week_no: 1, day_no: 2 }), S('1.1.4', { week_no: 1, day_no: 3 }), CP],
            { layout: 'SPRINT' },
          ),
        ]),
    ],
    ['curriculum_items_forbidden', () => pkgOf([track('GT-STRUCT', 1, base(), { kind: 'CURRICULUM' })])],
    ['style_reserved', () => ({ contract_version: '1.2', sub_modules: [subItem({ materials_variants: [{ style: 'LEARN_FIRST', article_markdown: '# Terpakai' }] })] })],
    [
      'duplicate_style_variant',
      () => ({
        contract_version: '1.2',
        sub_modules: [subItem({ materials_variants: [{ style: 'PRACTICE_FIRST', article_markdown: '# A' }, { style: 'PRACTICE_FIRST', article_markdown: '# B' }] })],
      }),
    ],
    ['variant_without_base', () => ({ contract_version: '1.2', sub_modules: [subItem({ materials: undefined, materials_variants: [{ style: 'CASE_BASED', article_markdown: '# Kasus' }] })] })],
  ];

  const SPEC_CODES = [
    'duplicate_track_code', 'duplicate_sort_order', 'sub_module_not_found', 'sub_module_not_gt', 'duplicate_sub_module_in_track', 'tier_order_violation',
    'checkpoint_first', 'checkpoint_adjacent', 'checkpoint_last_required', 'checkpoint_group_size', 'sprint_slot_required', 'slot_not_allowed',
    'sprint_slot_order', 'curriculum_items_forbidden', 'style_reserved', 'duplicate_style_variant', 'variant_without_base',
  ];

  it('AC-14: daftar fixture negatif mencakup persis tiap kode galat pada daftar aturan validator spec (satu fixture per kode)', () => {
    expect(negatives.map(([c]) => c).sort()).toEqual([...SPEC_CODES].sort());
  });

  for (const [code, build] of negatives) {
    it(`AC-14: fixture negatif menghasilkan ${code} (dan hanya kode itu)`, () => {
      const r = parseContentPackage(build());
      expect(r.ok).toBe(false);
      expect([...new Set(codesOf(r))]).toEqual([code]);
    });
  }

  it('AC-14: fixture positif sintetis (LIST dan SPRINT) lolos', () => {
    const list = pkgOf([track('GT-A', 1, [...base(), S('2.1.1'), S('2.1.2'), S('2.1.4'), S('2.2.1'), CP])]);
    expect(codesOf(parseContentPackage(list))).toEqual([]);
    expect(parseContentPackage(list).ok).toBe(true);
    const sprint = pkgOf([
      track('GT-B', 2, [S('1.1.3', { week_no: 1, day_no: 1 }), S('1.1.4', { week_no: 1, day_no: 2 }), S('2.1.1', { week_no: 1, day_no: 3 }), S('2.1.2', { week_no: 1, day_no: 4 }), CP], { layout: 'SPRINT' }),
    ]);
    expect(parseContentPackage(sprint).ok).toBe(true);
    const variants = { contract_version: '1.2', sub_modules: [subItem({ materials_variants: [{ style: 'PRACTICE_FIRST', article_markdown: '# A' }, { style: 'CASE_BASED', article_markdown: '# B' }] })] };
    expect(parseContentPackage(variants).ok).toBe(true);
  });

  it('AC-14: berkas jalur nyata content/gt-tracks/tracks.json lolos validator', () => {
    const raw = JSON.parse(readFileSync(path.resolve('content', 'gt-tracks', 'tracks.json'), 'utf8'));
    const r = parseContentPackage(raw);
    expect(r.ok ? [] : r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
