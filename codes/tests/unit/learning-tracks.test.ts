import { describe, expect, it } from 'vitest';
import {
  applyTrackSequential,
  trackLockReasonOf,
  type TrackRef,
} from '@/server/gatekeeping/track';
import {
  recompute,
  type ModuleNode,
  type Review,
  type Snapshot,
  type SubNode,
  type TierNode,
} from '@/server/gatekeeping/rules';
import {
  checkpointBlock,
  checkpointOrdinals,
  groupSprintItems,
} from '@/components/tracks/track-utils';
import type { TrackItem } from '@/lib/api/tracks';

let n = 0;
const makeSub = (code: string, order: number, over: Partial<SubNode> = {}): SubNode => ({
  kind: 'SUB_MODULE',
  id: `sub_${++n}`,
  moduleId: '',
  code,
  title: `Sub ${code}`,
  passing: 75,
  order,
  review: 'PUBLISHED',
  drillPass: null,
  hasMiniTask: false,
  status: 'LOCKED',
  unlockSource: null,
  learnCompleted: false,
  miniTaskCompleted: false,
  crown: 'NONE',
  best: 0,
  attempts: 0,
  completedAt: null,
  ...over,
});

const makeMod = (
  code: string,
  order: number,
  subs: SubNode[],
  review: Review = 'PUBLISHED',
  over: Partial<ModuleNode> = {},
): ModuleNode => {
  const m: ModuleNode = {
    kind: 'MODULE',
    id: `mod_${++n}`,
    tierId: '',
    code,
    skill: 'GRAMMAR',
    title: `Modul ${code}`,
    order,
    review,
    status: 'LOCKED',
    unlockSource: null,
    skipBest: null,
    completedAt: null,
    subs,
    ...over,
  };
  subs.forEach((s) => (s.moduleId = m.id));
  return m;
};

const makeTier = (number: number, modules: ModuleNode[], over: Partial<TierNode> = {}): TierNode => ({
  kind: 'TIER',
  id: `tier_${number}`,
  number,
  title: `Tier ${number}`,
  cefr: 'A1',
  bandMin: 3,
  bandMax: 4,
  gateType: 'PERCENT',
  gateValue: 80,
  skipThreshold: 85,
  status: 'LOCKED',
  unlockSource: null,
  bossBestPercent: null,
  bossBestBand: null,
  bossPassedAt: null,
  completedAt: null,
  modules,
  ...over,
});

const makeSnap = (...tiers: TierNode[]): Snapshot => ({
  tiers,
  origin: new Map(),
  dirty: new Set(),
});

describe('applyTrackSequential (SPEC-021 D5)', () => {
  it('membuka sub-modul pertama di jalur CURATED jika Tier terbuka', () => {
    const a = makeSub('1.1.1', 1);
    const b = makeSub('1.1.2', 2);
    const c = makeSub('1.2.1', 1);
    const t1 = makeTier(1, [makeMod('1.1', 1, [a, b]), makeMod('1.2', 2, [c])]);
    const snap = makeSnap(t1);
    recompute(snap);

    const track: TrackRef = {
      id: 'trk-1',
      code: 'GT-WRITING',
      kind: 'CURATED',
      items: [
        { kind: 'SUB_MODULE', subModuleId: a.id, subModuleCode: a.code },
        { kind: 'CHECKPOINT' },
        { kind: 'SUB_MODULE', subModuleId: c.id, subModuleCode: c.code },
      ],
    };

    applyTrackSequential(snap, track);
    expect(a.status).toBe('UNLOCKED');
    expect(c.status).toBe('LOCKED');
  });

  it('membuka sub-modul berikutnya di jalur saat sub-modul sebelumnya selesai, mengabaikan checkpoint', () => {
    const a = makeSub('1.1.1', 1, { status: 'COMPLETED', learnCompleted: true, best: 80 });
    const b = makeSub('1.1.2', 2);
    const c = makeSub('1.2.1', 1);
    const t1 = makeTier(1, [makeMod('1.1', 1, [a, b]), makeMod('1.2', 2, [c])]);
    const snap = makeSnap(t1);
    recompute(snap);

    const track: TrackRef = {
      id: 'trk-1',
      code: 'GT-WRITING',
      kind: 'CURATED',
      items: [
        { kind: 'SUB_MODULE', subModuleId: a.id, subModuleCode: a.code },
        { kind: 'CHECKPOINT' },
        { kind: 'SUB_MODULE', subModuleId: c.id, subModuleCode: c.code },
      ],
    };

    applyTrackSequential(snap, track);
    // Karena a selesai, c dibuka sekuensial walau di kurikulum default b belum selesai
    expect(c.status).toBe('UNLOCKED');
    expect(c.unlockSource).toBe('SEQUENTIAL');
  });

  it('AC-7 & D5: Tier LOCKED menahan sub-modul tetap LOCKED di semua jalur', () => {
    const a = makeSub('1.1.1', 1, { status: 'COMPLETED', learnCompleted: true, best: 90 });
    const t1 = makeTier(1, [makeMod('1.1', 1, [a])]);
    const x = makeSub('2.1.1', 1);
    const t2 = makeTier(2, [makeMod('2.1', 1, [x])]); // Tier 2 LOCKED
    const snap = makeSnap(t1, t2);
    recompute(snap);

    const track: TrackRef = {
      id: 'trk-1',
      code: 'GT-WRITING',
      kind: 'CURATED',
      items: [
        { kind: 'SUB_MODULE', subModuleId: a.id, subModuleCode: a.code },
        { kind: 'SUB_MODULE', subModuleId: x.id, subModuleCode: x.code },
      ],
    };

    applyTrackSequential(snap, track);
    expect(x.status).toBe('LOCKED');

    const lockReason = trackLockReasonOf(t2, t2.modules[0]!, x, track, a);
    expect(lockReason).toEqual({
      code: 'TIER_LOCKED',
      blocking_sub_module_id: null,
      message: 'Selesaikan Boss Stage Tier 1 atau ikuti Uji Kompetensi untuk membuka Tier ini.',
    });
  });

  it('AC-12: item COMING_SOON dilewati dan tidak memblokir item sesudahnya', () => {
    const a = makeSub('1.1.1', 1, { status: 'COMPLETED', learnCompleted: true, best: 80 });
    const draft = makeSub('1.1.2', 2, { review: 'DRAFT' }); // COMING_SOON
    const c = makeSub('1.1.3', 3);
    const t1 = makeTier(1, [makeMod('1.1', 1, [a, draft, c])]);
    const snap = makeSnap(t1);
    recompute(snap);

    const track: TrackRef = {
      id: 'trk-1',
      code: 'GT-WRITING',
      kind: 'CURATED',
      items: [
        { kind: 'SUB_MODULE', subModuleId: a.id, subModuleCode: a.code },
        { kind: 'SUB_MODULE', subModuleId: draft.id, subModuleCode: draft.code },
        { kind: 'SUB_MODULE', subModuleId: c.id, subModuleCode: c.code },
      ],
    };

    applyTrackSequential(snap, track);
    expect(c.status).toBe('UNLOCKED');
  });
});

describe('track-utils (UI helper functions)', () => {
  it('groupSprintItems mengelompokkan item per minggu dan checkpoint masuk minggu sebelumnya', () => {
    const items: TrackItem[] = [
      {
        position: 1,
        kind: 'SUB_MODULE',
        item_id: '1',
        week_no: 1,
        day_no: 1,
        sub_module: null,
        checkpoint: null,
      },
      {
        position: 2,
        kind: 'SUB_MODULE',
        item_id: '2',
        week_no: 1,
        day_no: 2,
        sub_module: null,
        checkpoint: null,
      },
      {
        position: 3,
        kind: 'CHECKPOINT',
        item_id: 'cp1',
        week_no: null,
        day_no: null,
        sub_module: null,
        checkpoint: null,
      },
      {
        position: 4,
        kind: 'SUB_MODULE',
        item_id: '4',
        week_no: 2,
        day_no: 1,
        sub_module: null,
        checkpoint: null,
      },
    ];

    const groups = groupSprintItems(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.week).toBe(1);
    expect(groups[0]?.items).toHaveLength(3); // 2 sub-module + 1 checkpoint
    expect(groups[1]?.week).toBe(2);
    expect(groups[1]?.items).toHaveLength(1);
  });

  it('checkpointOrdinals memberi nomor urut 1, 2, ... pada checkpoint', () => {
    const items: TrackItem[] = [
      { position: 1, kind: 'SUB_MODULE', item_id: '1', week_no: null, day_no: null, sub_module: null, checkpoint: null },
      { position: 2, kind: 'CHECKPOINT', item_id: 'cp1', week_no: null, day_no: null, sub_module: null, checkpoint: null },
      { position: 3, kind: 'SUB_MODULE', item_id: '2', week_no: null, day_no: null, sub_module: null, checkpoint: null },
      { position: 4, kind: 'CHECKPOINT', item_id: 'cp2', week_no: null, day_no: null, sub_module: null, checkpoint: null },
    ];
    const ord = checkpointOrdinals(items);
    expect(ord.get(2)).toBe(1);
    expect(ord.get(4)).toBe(2);
  });

  it('checkpointBlock memvalidasi kelayakan mulai checkpoint', () => {
    expect(
      checkpointBlock({
        status: 'NOT_READY',
        best_percent: null,
        covers: ['1.1.1'],
        pool_size: 10,
        pass_percent: 75,
      }),
    ).toBe('NOT_READY');

    expect(
      checkpointBlock({
        status: 'READY',
        best_percent: null,
        covers: ['1.1.1'],
        pool_size: 4,
        pass_percent: 75,
      }),
    ).toBe('NOT_ENOUGH');

    expect(
      checkpointBlock({
        status: 'READY',
        best_percent: null,
        covers: ['1.1.1'],
        pool_size: 10,
        pass_percent: 75,
      }),
    ).toBeNull();
  });
});
