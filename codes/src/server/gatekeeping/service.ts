/**
 * GatekeepingService (SPEC-003). SATU-SATUNYA modul yang menulis status/unlock_source/completed_at/
 * best_score_percent/attempts_count/skip_best_percent/boss_* pada tabel progres.
 * Semua fungsi dipanggil di dalam transaksi pemanggil dan bersifat idempoten dan monoton.
 */
import { activeExamModule } from './exam-module';
import { and, eq, sql } from 'drizzle-orm';
import { userSubModuleProgress, users } from '@/db/schema';
import { writeAudit } from '../audit';
import { execute, NOW, type DbOrTx, type Tx } from '../db';
import { ApiError } from '../http/errors';
import {
  chainOf,
  isAvailable,
  isTerminal,
  lockReasonOf,
  moduleAvailable,
  passOf,
  recompute,
  setStatus,
  type Entity,
  type ModuleNode,
  type Review,
  type Snapshot,
  type Status,
  type SubNode,
  type TierNode,
  type UnlockSrc,
} from './rules';

export interface UnlockedEntity {
  kind: 'TIER' | 'MODULE' | 'SUB_MODULE';
  id: string;
  label: string;
}
export interface ApplyResult {
  unlocked: UnlockedEntity[];
}

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const date = (v: unknown): Date | null => (v === null || v === undefined ? null : new Date(v as string));

/** INSERT ... ON CONFLICT DO NOTHING untuk semua entitas non-ARCHIVED yang belum punya baris progres. */
export async function ensureProgressRows(tx: DbOrTx, userId: string): Promise<void> {
  await tx.run(sql`INSERT OR IGNORE INTO user_tier_progress (user_id, tier_id) SELECT ${userId}, id FROM tiers`);
  await tx.run(sql`INSERT OR IGNORE INTO user_module_progress (user_id, module_id) SELECT ${userId}, id FROM modules WHERE status <> 'ARCHIVED'`);
  await tx.run(sql`INSERT OR IGNORE INTO user_sub_module_progress (user_id, sub_module_id) SELECT ${userId}, id FROM sub_modules WHERE status <> 'ARCHIVED'`);
}

/** Transaksi diserialkan (BEGIN IMMEDIATE + mutex), jadi tidak ada kunci baris yang perlu diambil. */
async function lockProgress(_tx: DbOrTx, _userId: string): Promise<void> {}

/** Satu query: seluruh pohon + progres pengguna (baris datar). */
export async function loadSnapshot(tx: DbOrTx, userId: string): Promise<Snapshot> {
  const res = await execute(tx, sql`
    SELECT t.id AS tier_id, t.tier_number, t.title AS tier_title, t.cefr_level, t.target_band_min, t.target_band_max,
           t.boss_gate_type, t.boss_gate_value, t.skip_threshold_percent,
           utp.status AS tier_status, utp.unlock_source AS tier_src, utp.boss_best_percent, utp.boss_best_band,
           utp.boss_passed_at, utp.completed_at AS tier_completed_at,
           m.id AS module_id, m.module_code, m.skill_category, m.title AS module_title, m.order_index AS module_order,
           m.status AS module_review, ump.status AS module_status, ump.unlock_source AS module_src,
           ump.skip_best_percent, ump.completed_at AS module_completed_at,
           s.id AS sub_id, s.sub_module_code, s.title AS sub_title, s.passing_score_percent, s.order_index AS sub_order,
           s.status AS sub_review, usp.status AS sub_status, usp.unlock_source AS sub_src,
           usp.learn_completed_at, usp.mini_task_completed_at, usp.mastery_crown, usp.best_score_percent,
           usp.attempts_count, usp.completed_at AS sub_completed_at,
           (SELECT a.pass_percent FROM assessment_sets a
              WHERE a.sub_module_id = s.id AND a.assessment_type = 'ACTIVE_DRILL' AND a.status = 'PUBLISHED'
              ORDER BY a.created_at, a.id LIMIT 1) AS drill_pass,
           (json_extract(lm.mini_task_json, '$.task_type') IS NOT NULL) AS has_mini
    FROM tiers t
    LEFT JOIN user_tier_progress utp ON utp.tier_id = t.id AND utp.user_id = ${userId}
    LEFT JOIN modules m ON m.tier_id = t.id AND m.status <> 'ARCHIVED'
    LEFT JOIN user_module_progress ump ON ump.module_id = m.id AND ump.user_id = ${userId}
    LEFT JOIN sub_modules s ON s.module_id = m.id AND s.status <> 'ARCHIVED'
      AND s.exam_module IN ('COMMON', ${activeExamModule()})
    LEFT JOIN user_sub_module_progress usp ON usp.sub_module_id = s.id AND usp.user_id = ${userId}
    LEFT JOIN learning_materials lm ON lm.sub_module_id = s.id
    ORDER BY t.tier_number, m.order_index, m.id, s.order_index, s.id
  `);
  const tiers = new Map<string, TierNode>();
  const mods = new Map<string, ModuleNode>();
  const origin = new Map<string, Status>();
  for (const r of res.rows as Row[]) {
    const tid = r.tier_id as string;
    let tier = tiers.get(tid);
    if (!tier) {
      tier = {
        kind: 'TIER',
        id: tid,
        number: Number(r.tier_number),
        title: r.tier_title as string,
        cefr: r.cefr_level as string,
        bandMin: Number(r.target_band_min),
        bandMax: Number(r.target_band_max),
        gateType: r.boss_gate_type as 'PERCENT' | 'BAND',
        gateValue: Number(r.boss_gate_value),
        skipThreshold: Number(r.skip_threshold_percent),
        status: (r.tier_status as Status | null) ?? 'LOCKED',
        unlockSource: (r.tier_src as UnlockSrc | null) ?? null,
        bossBestPercent: num(r.boss_best_percent),
        bossBestBand: num(r.boss_best_band),
        bossPassedAt: date(r.boss_passed_at),
        completedAt: date(r.tier_completed_at),
        modules: [],
      };
      tiers.set(tid, tier);
      origin.set(tid, tier.status);
    }
    const mid = r.module_id as string | null;
    if (!mid) continue;
    let mod = mods.get(mid);
    if (!mod) {
      mod = {
        kind: 'MODULE',
        id: mid,
        tierId: tid,
        code: r.module_code as string,
        skill: r.skill_category as string,
        title: r.module_title as string,
        order: Number(r.module_order),
        review: r.module_review as Review,
        status: (r.module_status as Status | null) ?? 'LOCKED',
        unlockSource: (r.module_src as UnlockSrc | null) ?? null,
        skipBest: num(r.skip_best_percent),
        completedAt: date(r.module_completed_at),
        subs: [],
      };
      mods.set(mid, mod);
      tier.modules.push(mod);
      origin.set(mid, mod.status);
    }
    const sid = r.sub_id as string | null;
    if (!sid) continue;
    const sub: SubNode = {
      kind: 'SUB_MODULE',
      id: sid,
      moduleId: mid,
      code: r.sub_module_code as string,
      title: r.sub_title as string,
      passing: Number(r.passing_score_percent),
      order: Number(r.sub_order),
      review: r.sub_review as Review,
      drillPass: num(r.drill_pass),
      hasMiniTask: Number(r.has_mini) === 1,
      status: (r.sub_status as Status | null) ?? 'LOCKED',
      unlockSource: (r.sub_src as UnlockSrc | null) ?? null,
      learnCompleted: r.learn_completed_at !== null && r.learn_completed_at !== undefined,
      miniTaskCompleted: r.mini_task_completed_at !== null && r.mini_task_completed_at !== undefined,
      crown: ((r.mastery_crown as string | null) ?? 'NONE') as SubNode['crown'],
      best: Number(r.best_score_percent ?? 0),
      attempts: Number(r.attempts_count ?? 0),
      completedAt: date(r.sub_completed_at),
    };
    mod.subs.push(sub);
    origin.set(sid, sub.status);
  }
  return { tiers: [...tiers.values()].sort((a, b) => a.number - b.number), origin, dirty: new Set() };
}

/** Tulis semua entitas `dirty` (keadaan penuh kolom yang dimiliki service ini), satu UPDATE per tabel. */
async function persist(tx: DbOrTx, userId: string, snap: Snapshot): Promise<void> {
  const tiers: Row[] = [];
  const mods: Row[] = [];
  const subs: Row[] = [];
  for (const e of snap.dirty) {
    const base = { id: e.id, status: e.status, src: e.unlockSource, done: e.completedAt?.getTime() ?? null };
    if (e.kind === 'TIER') {
      tiers.push({
        ...base,
        bp: e.bossBestPercent,
        bb: e.bossBestBand,
        bpa: e.bossPassedAt?.getTime() ?? null,
      });
    } else if (e.kind === 'MODULE') mods.push({ ...base, sb: e.skipBest });
    else subs.push({ ...base, best: e.best, att: e.attempts });
  }
  if (tiers.length) {
    await tx.run(sql`
      UPDATE user_tier_progress AS p SET status = v.status, unlock_source = v.src,
             completed_at = v.done, boss_best_percent = v.bp, boss_best_band = v.bb, boss_passed_at = v.bpa, updated_at = ${NOW}
      FROM (SELECT json_extract(j.value, '$.id') AS id, json_extract(j.value, '$.status') AS status, json_extract(j.value, '$.src') AS src,
                   json_extract(j.value, '$.done') AS done, json_extract(j.value, '$.bp') AS bp, json_extract(j.value, '$.bb') AS bb,
                   json_extract(j.value, '$.bpa') AS bpa FROM json_each(${JSON.stringify(tiers)}) AS j) AS v
      WHERE p.user_id = ${userId} AND p.tier_id = v.id`);
  }
  if (mods.length) {
    await tx.run(sql`
      UPDATE user_module_progress AS p SET status = v.status, unlock_source = v.src,
             completed_at = v.done, skip_best_percent = v.sb, updated_at = ${NOW}
      FROM (SELECT json_extract(j.value, '$.id') AS id, json_extract(j.value, '$.status') AS status, json_extract(j.value, '$.src') AS src,
                   json_extract(j.value, '$.done') AS done, json_extract(j.value, '$.sb') AS sb FROM json_each(${JSON.stringify(mods)}) AS j) AS v
      WHERE p.user_id = ${userId} AND p.module_id = v.id`);
  }
  if (subs.length) {
    await tx.run(sql`
      UPDATE user_sub_module_progress AS p SET status = v.status, unlock_source = v.src,
             completed_at = v.done, best_score_percent = v.best, attempts_count = v.att, updated_at = ${NOW}
      FROM (SELECT json_extract(j.value, '$.id') AS id, json_extract(j.value, '$.status') AS status, json_extract(j.value, '$.src') AS src,
                   json_extract(j.value, '$.done') AS done, json_extract(j.value, '$.best') AS best, json_extract(j.value, '$.att') AS att
            FROM json_each(${JSON.stringify(subs)}) AS j) AS v
      WHERE p.user_id = ${userId} AND p.sub_module_id = v.id`);
  }
}

function unlockedList(snap: Snapshot): UnlockedEntity[] {
  const out: UnlockedEntity[] = [];
  for (const e of snap.dirty) {
    const before = snap.origin.get(e.id);
    if (before === e.status) continue;
    if (e.status !== 'UNLOCKED' && e.status !== 'SKIPPED') continue;
    const kind = e.kind;
    const label = e.kind === 'TIER' ? `Tier ${e.number}: ${e.title}` : e.title;
    out.push({ kind, id: e.id, label });
  }
  const order = { TIER: 0, MODULE: 1, SUB_MODULE: 2 } as const;
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}

/** Sinkron + tulis. Dipakai semua apply*: kunci, muat, ubah (callback), recompute, simpan. */
async function mutate(
  tx: DbOrTx,
  userId: string,
  fn: (snap: Snapshot) => void,
): Promise<ApplyResult> {
  await ensureProgressRows(tx, userId);
  await lockProgress(tx, userId);
  const snap = await loadSnapshot(tx, userId);
  fn(snap);
  recompute(snap);
  await persist(tx, userId, snap);
  return { unlocked: unlockedList(snap) };
}

export async function initializeProgress(tx: DbOrTx, userId: string): Promise<void> {
  await recomputeStatuses(tx, userId);
}

/**
 * recomputeStatuses: terapkan D4/D5/D6. Jalur cepat tanpa kunci bila tidak ada perubahan.
 * Mengembalikan snapshot terkini (setelah perubahan) agar pembaca tidak perlu memuat ulang.
 */
export async function recomputeStatuses(tx: DbOrTx, userId: string): Promise<Snapshot> {
  await ensureProgressRows(tx, userId);
  let snap = await loadSnapshot(tx, userId);
  recompute(snap);
  if (snap.dirty.size === 0) return snap;
  // Ada perubahan: kunci berurutan, muat ulang (keadaan terbaru), hitung ulang, simpan.
  await lockProgress(tx, userId);
  snap = await loadSnapshot(tx, userId);
  recompute(snap);
  await persist(tx, userId, snap);
  return snap;
}

export async function markStarted(tx: DbOrTx, userId: string, subModuleId: string): Promise<void> {
  const cur = await execute(
    tx,
    sql`SELECT status FROM user_sub_module_progress WHERE user_id = ${userId} AND sub_module_id = ${subModuleId}`,
  );
  if ((cur.rows[0] as Row | undefined)?.status !== 'UNLOCKED') return;
  await mutate(tx, userId, (snap) => {
    const sub = findSub(snap, subModuleId);
    if (sub && sub.status === 'UNLOCKED') setStatus(snap, sub, 'IN_PROGRESS');
  });
}

function findSub(snap: Snapshot, id: string): SubNode | undefined {
  for (const t of snap.tiers) for (const m of t.modules) for (const s of m.subs) if (s.id === id) return s;
  return undefined;
}
function findModule(snap: Snapshot, id: string): { tier: TierNode; mod: ModuleNode } | undefined {
  for (const t of snap.tiers) for (const m of t.modules) if (m.id === id) return { tier: t, mod: m };
  return undefined;
}

export interface AccessibleSubModule {
  subModule: { id: string; moduleId: string; code: string; title: string; passingScorePercent: number };
  progress: { status: Status; unlockSource: UnlockSrc | null; learnCompleted: boolean; bestScorePercent: number; attempts: number };
}

/** Dipanggil spec lain sebelum melayani materi/soal. Melempar NOT_FOUND (404) atau LOCKED_CONTENT (403). */
export async function assertSubModuleAccessible(tx: DbOrTx, userId: string, subModuleId: string): Promise<AccessibleSubModule> {
  await ensureProgressRows(tx, userId);
  const snap = await recomputeStatuses(tx, userId);
  for (const tier of snap.tiers) {
    for (const mod of tier.modules) {
      const sub = mod.subs.find((s) => s.id === subModuleId);
      if (!sub) continue;
      if (!isAvailable(mod, sub)) throw new ApiError('NOT_FOUND');
      if (sub.status === 'LOCKED') {
        const r = lockReasonOf(tier, mod, sub)!;
        throw new ApiError('LOCKED_CONTENT', {
          details: [{ path: 'sub_module_id', code: r.code === 'NOT_PUBLISHED' ? 'PREVIOUS_INCOMPLETE' : r.code, message: r.message }],
        });
      }
      return {
        subModule: { id: sub.id, moduleId: mod.id, code: sub.code, title: sub.title, passingScorePercent: passOf(sub) },
        progress: {
          status: sub.status,
          unlockSource: sub.unlockSource,
          learnCompleted: sub.learnCompleted,
          bestScorePercent: sub.best,
          attempts: sub.attempts,
        },
      };
    }
  }
  throw new ApiError('NOT_FOUND');
}

/** Skor 0-100 dengan maksimal 2 desimal -> sentesimal (bilangan bulat), tanpa aritmetika float pada perbandingan. */
export function toHundredths(score: number | string): number {
  const n = typeof score === 'string' ? Number(score) : score;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error('scorePercent di luar rentang 0-100');
  }
  return Math.round(n * 100);
}

export async function applyDrillResult(
  tx: DbOrTx,
  userId: string,
  input: { subModuleId: string; scorePercent: number | string },
): Promise<ApplyResult> {
  const hundredths = toHundredths(input.scorePercent);
  return mutate(tx, userId, (snap) => {
    const sub = findSub(snap, input.subModuleId);
    if (!sub) throw new Error('sub-modul tidak ditemukan untuk applyDrillResult');
    if (sub.status === 'LOCKED') throw new Error('applyDrillResult pada sub-modul terkunci');
    sub.attempts += 1;
    sub.best = Math.max(sub.best, Math.floor(hundredths / 100));
    snap.dirty.add(sub);
    if (hundredths >= passOf(sub) * 100) {
      if (!isTerminal(sub.status)) setStatus(snap, sub, 'COMPLETED');
    } else if (sub.status === 'UNLOCKED') {
      setStatus(snap, sub, 'IN_PROGRESS');
    }
  });
}

/** LOCKED/UNLOCKED -> SKIPPED; unlock_source ditimpa sumber skip (SKIP_TEST/PLACEMENT) dan completed_at diisi sekali. */
function skipEntity(snap: Snapshot, e: Entity, src: UnlockSrc) {
  if (e.status === 'LOCKED' || e.status === 'UNLOCKED') {
    setStatus(snap, e, 'SKIPPED');
    e.unlockSource = src;
    snap.dirty.add(e);
  }
}

export async function applySkipResult(
  tx: DbOrTx,
  userId: string,
  input: { scope: 'MODULE' | 'TIER'; targetId: string; scorePercent: number | string; passed: boolean },
): Promise<ApplyResult> {
  const hundredths = toHundredths(input.scorePercent);
  const percent = hundredths / 100;
  return mutate(tx, userId, (snap) => {
    if (input.scope === 'MODULE') {
      const f = findModule(snap, input.targetId);
      if (!f) throw new Error('modul tidak ditemukan untuk applySkipResult');
      const { mod } = f;
      if (isTerminal(mod.status)) return; // monoton: tidak mengubah apa pun
      if (mod.skipBest === null || percent > mod.skipBest) {
        mod.skipBest = percent;
        snap.dirty.add(mod);
      }
      if (!input.passed) return;
      for (const sub of mod.subs.filter((s) => isAvailable(mod, s))) skipEntity(snap, sub, 'SKIP_TEST');
      skipEntity(snap, mod, 'SKIP_TEST');
    } else {
      const tier = snap.tiers.find((t) => t.id === input.targetId);
      if (!tier) throw new Error('tier tidak ditemukan untuk applySkipResult');
      if (!input.passed || isTerminal(tier.status) || !(tier.status === 'LOCKED' || tier.status === 'UNLOCKED')) return;
      for (const mod of tier.modules.filter((m) => m.review === 'PUBLISHED')) {
        for (const sub of mod.subs.filter((s) => isAvailable(mod, s))) skipEntity(snap, sub, 'SKIP_TEST');
        if (moduleAvailable(mod)) skipEntity(snap, mod, 'SKIP_TEST');
      }
      skipEntity(snap, tier, 'SKIP_TEST');
    }
  });
}

export async function applyBossResult(
  tx: DbOrTx,
  userId: string,
  input: { tierId: string; percent: number | string; band: number | null; passed: boolean },
): Promise<ApplyResult> {
  const percent = toHundredths(input.percent) / 100;
  return mutate(tx, userId, (snap) => {
    const tier = snap.tiers.find((t) => t.id === input.tierId);
    if (!tier) throw new Error('tier tidak ditemukan untuk applyBossResult');
    if (tier.bossBestPercent === null || percent > tier.bossBestPercent) tier.bossBestPercent = percent;
    if (input.band !== null && (tier.bossBestBand === null || input.band > tier.bossBestBand)) tier.bossBestBand = input.band;
    if (input.passed && tier.bossPassedAt === null) tier.bossPassedAt = new Date();
    snap.dirty.add(tier);
  });
}

export async function applyPlacementResult(
  tx: DbOrTx,
  userId: string,
  input: { tierNumber: number },
): Promise<ApplyResult> {
  if (!Number.isInteger(input.tierNumber) || input.tierNumber < 1 || input.tierNumber > 4) {
    throw new Error('tierNumber harus 1-4');
  }
  const result = await mutate(tx, userId, (snap) => {
    for (const tier of snap.tiers) {
      if (tier.number < input.tierNumber) {
        for (const mod of tier.modules.filter((m) => m.review === 'PUBLISHED')) {
          for (const sub of mod.subs.filter((s) => isAvailable(mod, s))) skipEntity(snap, sub, 'PLACEMENT');
          if (moduleAvailable(mod)) skipEntity(snap, mod, 'PLACEMENT');
        }
        skipEntity(snap, tier, 'PLACEMENT');
      } else if (tier.number === input.tierNumber && tier.status === 'LOCKED') {
        setStatus(snap, tier, 'UNLOCKED', 'PLACEMENT');
      }
    }
  });
  await tx.update(users).set({ placementCompletedAt: sql`coalesce(${users.placementCompletedAt}, ${NOW})` }).where(eq(users.id, userId));
  return result;
}

export interface OverrideInput {
  level: 'TIER' | 'MODULE' | 'SUB_MODULE';
  targetId: string;
}

/** Override admin: entitas LOCKED -> UNLOCKED (unlock_source=ADMIN) + audit PROGRESS_OVERRIDE. */
export async function adminOverride(
  tx: Tx,
  adminId: string | null,
  userId: string,
  input: OverrideInput,
  ipHash?: string,
): Promise<{ level: OverrideInput['level']; targetId: string; status: 'UNLOCKED'; unlockSource: 'ADMIN' }> {
  const u = await execute(tx, sql`SELECT 1 FROM users WHERE id = ${userId} AND deleted_at IS NULL`);
  if (u.rows.length === 0) throw new ApiError('NOT_FOUND');
  await mutate(tx, userId, (snap) => {
    let target: Entity | undefined;
    let first: SubNode | undefined;
    if (input.level === 'TIER') {
      const t = snap.tiers.find((x) => x.id === input.targetId);
      target = t;
      first = t ? chainOf(t)[0]?.sub : undefined;
      if (t && !t.modules.some((m) => moduleAvailable(m))) throw new ApiError('NOT_AVAILABLE');
    } else if (input.level === 'MODULE') {
      const f = findModule(snap, input.targetId);
      target = f?.mod;
      if (f && (f.mod.review !== 'PUBLISHED' || !moduleAvailable(f.mod))) throw new ApiError('NOT_AVAILABLE');
      first = f ? chainOf(f.tier).find((c) => c.mod.id === f.mod.id)?.sub : undefined;
    } else {
      const s = findSub(snap, input.targetId);
      target = s;
      if (s) {
        const mod = findModule(snap, s.moduleId)!.mod;
        if (!isAvailable(mod, s)) throw new ApiError('NOT_AVAILABLE');
      }
    }
    if (!target) throw new ApiError('NOT_FOUND');
    if (target.status !== 'LOCKED') throw new ApiError('ALREADY_UNLOCKED');
    setStatus(snap, target, 'UNLOCKED', 'ADMIN');
    target.unlockSource = 'ADMIN';
    snap.dirty.add(target);
    // Tier/Modul: sub-modul pertama rantai ikut terbuka agar konsisten dengan D5.
    if (first && first.status === 'LOCKED') {
      setStatus(snap, first, 'UNLOCKED', 'ADMIN');
      first.unlockSource = 'ADMIN';
    }
  });
  await writeAudit(tx, {
    actorUserId: adminId,
    action: 'PROGRESS_OVERRIDE',
    entityType: 'user',
    entityId: userId,
    metadata: { level: input.level, target_id: input.targetId },
    ipHash,
  });
  return { level: input.level, targetId: input.targetId, status: 'UNLOCKED', unlockSource: 'ADMIN' };
}

// Ekspor tipe untuk pembangun pohon.
export type { Snapshot, TierNode, ModuleNode, SubNode };

export async function getSubModuleCrown(
  tx: DbOrTx,
  userId: string,
  subModuleId: string,
): Promise<'NONE' | 'SILVER' | 'GOLD'> {
  const [row] = await tx
    .select({ masteryCrown: userSubModuleProgress.masteryCrown })
    .from(userSubModuleProgress)
    .where(
      and(
        eq(userSubModuleProgress.userId, userId),
        eq(userSubModuleProgress.subModuleId, subModuleId),
      ),
    )
    .limit(1);
  return (row?.masteryCrown as 'NONE' | 'SILVER' | 'GOLD') ?? 'NONE';
}

export async function updateSubModuleCrown(
  tx: DbOrTx,
  userId: string,
  subModuleId: string,
  crown: 'SILVER' | 'GOLD',
  now = new Date(),
): Promise<void> {
  await tx
    .update(userSubModuleProgress)
    .set({ masteryCrown: crown, updatedAt: now })
    .where(
      and(
        eq(userSubModuleProgress.userId, userId),
        eq(userSubModuleProgress.subModuleId, subModuleId),
      ),
    );
}

export async function getCrownCounts(
  tx: DbOrTx,
  userId: string,
): Promise<{ gold: number; silver: number }> {
  const [crownCountRow] = await tx
    .select({
      gold: sql<number>`count(*) filter (where mastery_crown = 'GOLD')`,
      silver: sql<number>`count(*) filter (where mastery_crown = 'SILVER')`,
    })
    .from(userSubModuleProgress)
    .where(eq(userSubModuleProgress.userId, userId));
  return {
    gold: crownCountRow?.gold ?? 0,
    silver: crownCountRow?.silver ?? 0,
  };
}
