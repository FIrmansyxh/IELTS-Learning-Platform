/**
 * Aturan murni SPEC-003 (D1-D9) di atas snapshot dalam memori. Tanpa akses DB agar dapat diuji unit.
 * Semua transisi monoton: status tidak pernah turun; COMPLETED/SKIPPED lengket.
 */
export type Status = 'LOCKED' | 'UNLOCKED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
export type UnlockSrc = 'DEFAULT' | 'SEQUENTIAL' | 'SKIP_TEST' | 'PLACEMENT' | 'BOSS_PASS' | 'ADMIN';
export type Review = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

export interface SubNode {
  kind: 'SUB_MODULE';
  id: string;
  moduleId: string;
  code: string;
  title: string;
  passing: number;
  order: number;
  review: Review;
  drillPass: number | null;
  hasMiniTask: boolean;
  status: Status;
  unlockSource: UnlockSrc | null;
  learnCompleted: boolean;
  miniTaskCompleted: boolean;
  crown: 'NONE' | 'SILVER' | 'GOLD';
  best: number;
  attempts: number;
  completedAt: Date | null;
}
export interface ModuleNode {
  kind: 'MODULE';
  id: string;
  tierId: string;
  code: string;
  skill: string;
  title: string;
  order: number;
  review: Review;
  status: Status;
  unlockSource: UnlockSrc | null;
  skipBest: number | null;
  completedAt: Date | null;
  subs: SubNode[];
}
export interface TierNode {
  kind: 'TIER';
  id: string;
  number: number;
  title: string;
  cefr: string;
  bandMin: number;
  bandMax: number;
  gateType: 'PERCENT' | 'BAND';
  gateValue: number;
  skipThreshold: number;
  status: Status;
  unlockSource: UnlockSrc | null;
  bossBestPercent: number | null;
  bossBestBand: number | null;
  bossPassedAt: Date | null;
  completedAt: Date | null;
  modules: ModuleNode[];
}
export type Entity = SubNode | ModuleNode | TierNode;

export interface Snapshot {
  tiers: TierNode[];
  /** Status awal tiap entitas (untuk menghitung `unlocked` dan baris yang berubah). */
  origin: Map<string, Status>;
  dirty: Set<Entity>;
}

export const RANK: Record<Status, number> = { LOCKED: 0, UNLOCKED: 1, IN_PROGRESS: 2, COMPLETED: 3, SKIPPED: 3 };
export const isTerminal = (s: Status) => s === 'COMPLETED' || s === 'SKIPPED';
export const isDone = isTerminal;
export const isStarted = (s: Status) => s === 'IN_PROGRESS' || s === 'COMPLETED' || s === 'SKIPPED';

/** D1: sub-modul AVAILABLE bila sub-modul dan modulnya PUBLISHED. */
export const isAvailable = (m: ModuleNode, s: SubNode) => s.review === 'PUBLISHED' && m.review === 'PUBLISHED';
export const availableSubs = (m: ModuleNode) => m.subs.filter((s) => isAvailable(m, s));
export const moduleAvailable = (m: ModuleNode) => availableSubs(m).length > 0;

/** D2: rantai urutan per Tier. Pemecah urutan ganda: id ASC. */
export function chainOf(t: TierNode): Array<{ mod: ModuleNode; sub: SubNode }> {
  const out: Array<{ mod: ModuleNode; sub: SubNode }> = [];
  const mods = [...t.modules].sort((a, b) => a.order - b.order || cmp(a.id, b.id));
  for (const mod of mods) {
    for (const sub of [...mod.subs].sort((a, b) => a.order - b.order || cmp(a.id, b.id))) {
      if (isAvailable(mod, sub)) out.push({ mod, sub });
    }
  }
  return out;
}
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function setStatus(snap: Snapshot, e: Entity, status: Status, source?: UnlockSrc | null, now = new Date()): boolean {
  let changed = false;
  if (e.status !== status) {
    e.status = status;
    changed = true;
  }
  if (source && e.unlockSource === null) {
    e.unlockSource = source;
    changed = true;
  }
  if (isTerminal(status) && e.completedAt === null) {
    e.completedAt = now;
    changed = true;
  }
  if (changed) snap.dirty.add(e);
  return changed;
}

export function passOf(s: SubNode): number {
  return s.drillPass ?? s.passing;
}

/**
 * recomputeStatuses: D4 (hanya LOCKED->UNLOCKED), D5 (modul), D6 (Tier) berurutan Tier 1..4.
 * Mengubah snapshot di tempat dan menandai entitas yang berubah di `snap.dirty`.
 */
export function recompute(snap: Snapshot, now = new Date()): void {
  const tiers = [...snap.tiers].sort((a, b) => a.number - b.number);
  tiers.forEach((tier, i) => {
    const prev = i > 0 ? tiers[i - 1]! : null;

    // D6: pembukaan Tier.
    if (tier.status === 'LOCKED') {
      if (tier.number === 1) setStatus(snap, tier, 'UNLOCKED', 'DEFAULT', now);
      else if (prev?.status === 'COMPLETED') setStatus(snap, tier, 'UNLOCKED', 'BOSS_PASS', now);
      else if (prev?.status === 'SKIPPED') setStatus(snap, tier, 'UNLOCKED', prev.unlockSource ?? 'SKIP_TEST', now);
    }

    const chain = chainOf(tier);

    // D6: IN_PROGRESS bila ada sub-modul yang sudah dimulai/selesai/dilewati (mis. Skip Test Modul).
    const started = tier.modules.flatMap((m) => m.subs).find((s) => isStarted(s.status));
    if (started && (tier.status === 'LOCKED' || tier.status === 'UNLOCKED')) {
      setStatus(snap, tier, 'IN_PROGRESS', started.unlockSource ?? 'DEFAULT', now);
    }

    // D4: pembukaan sub-modul sepanjang rantai.
    if (tier.status !== 'LOCKED') {
      let prevSub: SubNode | null = null;
      for (const { sub } of chain) {
        if (sub.status === 'LOCKED') {
          if (prevSub === null) {
            setStatus(snap, sub, 'UNLOCKED', tier.number === 1 ? 'DEFAULT' : (tier.unlockSource ?? 'DEFAULT'), now);
          } else if (isDone(prevSub.status)) {
            setStatus(snap, sub, 'UNLOCKED', 'SEQUENTIAL', now);
          }
        }
        prevSub = sub;
      }
    }

    // D5: status modul.
    for (const mod of [...tier.modules].sort((a, b) => a.order - b.order)) {
      const avail = availableSubs(mod);
      if (mod.review !== 'PUBLISHED' || avail.length === 0) continue;
      const sts = avail.map((s) => s.status);
      let computed: Status;
      if (sts.every((s) => s === 'SKIPPED')) computed = 'SKIPPED';
      else if (sts.every(isDone)) computed = 'COMPLETED';
      else if (sts.some(isStarted)) computed = 'IN_PROGRESS';
      else if (sts.some((s) => s === 'UNLOCKED')) computed = 'UNLOCKED';
      else computed = 'LOCKED';
      if (!isTerminal(mod.status) && RANK[computed] > RANK[mod.status]) {
        const first = avail.find((s) => s.unlockSource) ?? avail[0]!;
        setStatus(snap, mod, computed, first.unlockSource ?? tier.unlockSource ?? 'DEFAULT', now);
      }
    }

    // D6: Tier COMPLETED = boss lulus + semua modul AVAILABLE selesai/dilewati.
    const availMods = tier.modules.filter((m) => m.review === 'PUBLISHED' && moduleAvailable(m));
    if (
      !isTerminal(tier.status) &&
      tier.bossPassedAt !== null &&
      availMods.length > 0 &&
      availMods.every((m) => isDone(m.status))
    ) {
      setStatus(snap, tier, 'COMPLETED', null, now);
    }
  });
}

export const percentOf = (done: number, total: number) => (total === 0 ? 0 : Math.floor((100 * done) / total));

/** D7: persentase progres sub-modul. */
export function subProgressPercent(s: SubNode): number {
  if (isDone(s.status)) return 100;
  const L = s.learnCompleted ? 1 : 0;
  const D = s.best >= passOf(s) ? 1 : 0;
  const M = s.miniTaskCompleted ? 1 : 0;
  return s.hasMiniTask ? 40 * L + 40 * D + 20 * M : 50 * L + 50 * D;
}

export function moduleProgressPercent(m: ModuleNode): number {
  const avail = availableSubs(m);
  return percentOf(avail.filter((s) => isDone(s.status)).length, avail.length);
}

export function tierProgressPercent(t: TierNode): number {
  if (isTerminal(t.status)) return 100;
  const avail = t.modules.flatMap(availableSubs);
  return percentOf(avail.filter((s) => isDone(s.status)).length, avail.length);
}

export type BossBlockedReason = 'TIER_LOCKED' | 'MODULES_INCOMPLETE' | 'NO_BOSS_PUBLISHED' | 'ALREADY_PASSED';

/** D9. `hasBossSet` = ada TIER_BOSS_EXAM PUBLISHED untuk Tier. */
export function bossState(t: TierNode, hasBossSet: boolean): { available: boolean; blocked: BossBlockedReason | null } {
  const availMods = t.modules.filter((m) => m.review === 'PUBLISHED' && moduleAvailable(m));
  const modulesDone = availMods.length > 0 && availMods.every((m) => isDone(m.status));
  let blocked: BossBlockedReason | null = null;
  if (t.status === 'LOCKED') blocked = 'TIER_LOCKED';
  else if (!modulesDone) blocked = 'MODULES_INCOMPLETE';
  else if (!hasBossSet) blocked = 'NO_BOSS_PUBLISHED';
  else if (t.bossPassedAt !== null || isTerminal(t.status)) blocked = 'ALREADY_PASSED';
  return { available: blocked === null, blocked };
}

/** D8: Skip Test tersedia untuk Modul/Tier yang belum dimulai. */
export const skipEligible = (status: Status) => status === 'LOCKED' || status === 'UNLOCKED';

export const PREVIOUS_MESSAGE = (title: string, pass: number) =>
  `Selesaikan ${title} dan capai skor latihan ${pass}% untuk membuka.`;
export const TIER_LOCKED_MESSAGE = (tierNumber: number) =>
  `Selesaikan Boss Stage Tier ${tierNumber - 1} atau ikuti Uji Kompetensi untuk membuka Tier ini.`;
export const NOT_PUBLISHED_MESSAGE = 'Materi ini belum tersedia. Segera hadir.';

export type LockReason = { code: 'TIER_LOCKED' | 'PREVIOUS_INCOMPLETE' | 'NOT_PUBLISHED'; blocking_sub_module_id: string | null; message: string };

/** Alasan terkunci satu sub-modul (null bila tidak LOCKED). */
export function lockReasonOf(tier: TierNode, mod: ModuleNode, sub: SubNode): LockReason | null {
  if (sub.status !== 'LOCKED') return null;
  if (!isAvailable(mod, sub)) return { code: 'NOT_PUBLISHED', blocking_sub_module_id: null, message: NOT_PUBLISHED_MESSAGE };
  if (tier.status === 'LOCKED') {
    return { code: 'TIER_LOCKED', blocking_sub_module_id: null, message: TIER_LOCKED_MESSAGE(tier.number) };
  }
  const chain = chainOf(tier);
  const idx = chain.findIndex((c) => c.sub.id === sub.id);
  const pred = idx > 0 ? chain[idx - 1]!.sub : null;
  return {
    code: 'PREVIOUS_INCOMPLETE',
    blocking_sub_module_id: pred?.id ?? null,
    message: pred ? PREVIOUS_MESSAGE(pred.title, passOf(pred)) : PREVIOUS_MESSAGE('materi sebelumnya', 75),
  };
}
