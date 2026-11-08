import pg from 'pg';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assessmentSets, auditLog, tiers, users } from '@/db/schema';
import {
  adminOverride,
  applyBossResult,
  applyDrillResult,
  applyPlacementResult,
  applySkipResult,
  assertSubModuleAccessible,
  markStarted,
  recomputeStatuses,
} from '@/server/gatekeeping/service';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { GET as treeGet } from '@/app/api/v1/curriculum/tree/route';
import { call, learnerSession, makeUser } from './helpers';

const db = getDb();
afterAll(closeDb);

type Tree = { tiers: any[] }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function resetContent() {
  await db.execute(sql`DELETE FROM assessment_sets`);
  await db.execute(sql`UPDATE sub_modules SET status = 'DRAFT'`);
  await db.execute(sql`UPDATE modules SET status = 'DRAFT'`);
  await db.execute(sql`DELETE FROM learning_materials`);
}
/** Publikasikan sub-modul (dan modul induknya). */
async function publish(...codes: string[]) {
  for (const c of codes) {
    await db.execute(sql`UPDATE sub_modules SET status = 'PUBLISHED' WHERE sub_module_code = ${c}`);
    await db.execute(
      sql`UPDATE modules SET status = 'PUBLISHED' WHERE id = (SELECT module_id FROM sub_modules WHERE sub_module_code = ${c})`,
    );
  }
}
async function addSet(type: 'SKIP_MODULE_TEST' | 'SKIP_TIER_TEST' | 'TIER_BOSS_EXAM', scopeCode: string | number) {
  const base = { assessmentType: type, title: `Set ${type}`, timeLimitSeconds: 900, origin: 'ORIGINAL_AUTHORED' as const, status: 'PUBLISHED' as const, questionCount: 12 };
  if (type === 'SKIP_MODULE_TEST') {
    const r = await db.execute(sql`SELECT id FROM modules WHERE module_code = ${scopeCode as string}`);
    const [s] = await db.insert(assessmentSets).values({ ...base, moduleId: (r.rows[0] as { id: string }).id }).returning();
    return s!;
  }
  const [t] = await db.select().from(tiers).where(eq(tiers.tierNumber, scopeCode as number));
  const [s] = await db.insert(assessmentSets).values({ ...base, tierId: t!.id }).returning();
  return s!;
}
const newUser = async () => (await makeUser()).user;
async function getTree(userId: string): Promise<Tree> {
  return db.transaction(async (tx) => {
    const { getCurriculumTree } = await import('@/server/gatekeeping/tree');
    void tx;
    return (await getCurriculumTree(db, userId)) as unknown as Tree;
  });
}
const sub = (t: Tree, code: string) => t.tiers.flatMap((x) => x.modules).flatMap((m: any) => m.sub_modules).find((s: any) => s.sub_module_code === code); // eslint-disable-line @typescript-eslint/no-explicit-any
const mod = (t: Tree, code: string) => t.tiers.flatMap((x) => x.modules).find((m: any) => m.module_code === code); // eslint-disable-line @typescript-eslint/no-explicit-any
const tier = (t: Tree, n: number) => t.tiers.find((x) => x.tier_number === n);
const drill = (userId: string, code: string, score: number | string) =>
  db.transaction(async (tx) => {
    const r = await tx.execute(sql`SELECT id FROM sub_modules WHERE sub_module_code = ${code}`);
    return applyDrillResult(tx, userId, { subModuleId: (r.rows[0] as { id: string }).id, scorePercent: score });
  });
const subId = async (code: string) => ((await db.execute(sql`SELECT id FROM sub_modules WHERE sub_module_code = ${code}`)).rows[0] as { id: string }).id;
const moduleId = async (code: string) => ((await db.execute(sql`SELECT id FROM modules WHERE module_code = ${code}`)).rows[0] as { id: string }).id;
const tierId = async (n: number) => (await db.select().from(tiers).where(eq(tiers.tierNumber, n)))[0]!.id;
const progressRow = async (userId: string, code: string) =>
  (await db.execute(sql`SELECT p.* FROM user_sub_module_progress p JOIN sub_modules s ON s.id = p.sub_module_id WHERE p.user_id = ${userId}::uuid AND s.sub_module_code = ${code}`)).rows[0] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(async () => {
  resetRateLimits();
  await resetContent();
});

describe('pohon dan status awal', () => {
  it('pengguna baru: Tier 1 UNLOCKED, 1.1.1 UNLOCKED(DEFAULT), 1.1.2 PREVIOUS_INCOMPLETE, Tier 2-4 TIER_LOCKED, draft COMING_SOON', async () => {
    await publish('1.1.1', '1.1.2', '2.1.1');
    const u = await newUser();
    const t = await getTree(u.id);
    expect(t.tiers).toHaveLength(4);
    expect(tier(t, 1)).toMatchObject({ status: 'UNLOCKED', unlock_source: 'DEFAULT' });
    expect(sub(t, '1.1.1')).toMatchObject({ status: 'UNLOCKED', content_state: 'AVAILABLE', lock_reason: null });
    const second = sub(t, '1.1.2');
    expect(second.status).toBe('LOCKED');
    expect(second.lock_reason).toMatchObject({ code: 'PREVIOUS_INCOMPLETE', blocking_sub_module_id: sub(t, '1.1.1').id });
    expect(second.lock_reason.message).toBe('Selesaikan Nouns, Pronouns, Articles (a/an/the), & Plurals dan capai skor latihan 75% untuk membuka.');
    expect(tier(t, 2).status).toBe('LOCKED');
    expect(sub(t, '2.1.1').lock_reason).toMatchObject({ code: 'TIER_LOCKED', message: 'Selesaikan Boss Stage Tier 1 atau ikuti Uji Kompetensi untuk membuka Tier ini.' });
    expect(sub(t, '1.1.3')).toMatchObject({ content_state: 'COMING_SOON', lock_reason: { code: 'NOT_PUBLISHED', message: 'Materi ini belum tersedia. Segera hadir.' } });
    expect(mod(t, '1.2').content_state).toBe('COMING_SOON');
    expect(t.tiers.reduce((n, x) => n + x.modules.length, 0)).toBe(13);
  });

  it('userCreatedHooks membuat progres; Tier tanpa sub-modul AVAILABLE: progress 0 dan MODULES_INCOMPLETE', async () => {
    const u = await newUser();
    await db.transaction((tx) => recomputeStatuses(tx, u.id));
    const t = await getTree(u.id);
    for (const x of t.tiers) {
      expect(x.progress_percent).toBe(0);
      expect(x.boss.blocked_reason).toBe(x.tier_number === 1 ? 'MODULES_INCOMPLETE' : 'TIER_LOCKED');
    }
  });

  it('sub-modul baru dipublikasikan setelah pengguna terdaftar: baris dibuat otomatis', async () => {
    const u = await newUser();
    await publish('1.1.1');
    await db.execute(sql`DELETE FROM user_sub_module_progress WHERE user_id = ${u.id}::uuid`);
    const t = await getTree(u.id);
    expect(sub(t, '1.1.1').status).toBe('UNLOCKED');
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM user_sub_module_progress WHERE user_id = ${u.id}::uuid`)).rows[0]).toEqual({ n: 33 });
  });

  it('mini_task_json {} -> has_mini_task=false; berisi task_type -> true; D7 persentase', async () => {
    await publish('1.1.1', '1.1.2');
    await db.execute(sql`INSERT INTO learning_materials (sub_module_id, article_markdown, origin, mini_task_json) SELECT id, 'x', 'ORIGINAL_AUTHORED', '{}'::jsonb FROM sub_modules WHERE sub_module_code = '1.1.1'`);
    await db.execute(sql`INSERT INTO learning_materials (sub_module_id, article_markdown, origin, mini_task_json) SELECT id, 'x', 'ORIGINAL_AUTHORED', '{"task_type":"SELF_CHECK","prompt":"p","ai_rubric_criteria":"c"}'::jsonb FROM sub_modules WHERE sub_module_code = '1.1.2'`);
    const u = await newUser();
    await db.transaction((tx) => recomputeStatuses(tx, u.id));
    await db.execute(sql`UPDATE user_sub_module_progress SET learn_completed_at = now() WHERE user_id = ${u.id}::uuid`);
    const t = await getTree(u.id);
    expect(sub(t, '1.1.1')).toMatchObject({ has_mini_task: false, progress_percent: 50 });
    expect(sub(t, '1.1.2')).toMatchObject({ has_mini_task: true, progress_percent: 40 });
  });
});

describe('applyDrillResult', () => {
  it('75.00 dengan pass 75 -> COMPLETED, 1.1.2 UNLOCKED(SEQUENTIAL), best 75, attempts 1; unlocked dilaporkan', async () => {
    await publish('1.1.1', '1.1.2');
    const u = await newUser();
    await getTree(u.id);
    const r = await drill(u.id, '1.1.1', 75);
    expect(r.unlocked.map((x) => x.kind)).toEqual(['SUB_MODULE']);
    expect(r.unlocked[0]!.label).toBe('Present Simple vs. Present Continuous');
    const a = await progressRow(u.id, '1.1.1');
    expect(a).toMatchObject({ status: 'COMPLETED', best_score_percent: 75, attempts_count: 1 });
    expect(a.completed_at).not.toBeNull();
    expect(await progressRow(u.id, '1.1.2')).toMatchObject({ status: 'UNLOCKED', unlock_source: 'SEQUENTIAL' });
  });

  it('74.99 -> tetap IN_PROGRESS, best 74, berikutnya LOCKED; string desimal diterima', async () => {
    await publish('1.1.1', '1.1.2');
    const u = await newUser();
    await getTree(u.id);
    await drill(u.id, '1.1.1', '74.99');
    expect(await progressRow(u.id, '1.1.1')).toMatchObject({ status: 'IN_PROGRESS', best_score_percent: 74 });
    expect((await progressRow(u.id, '1.1.2')).status).toBe('LOCKED');
  });

  it('best 80 lalu 60: best tetap 80, COMPLETED, attempts +1; panggilan ulang tidak mengubah completed_at', async () => {
    await publish('1.1.1', '1.1.2');
    const u = await newUser();
    await getTree(u.id);
    await drill(u.id, '1.1.1', 80);
    const first = await progressRow(u.id, '1.1.1');
    await drill(u.id, '1.1.1', 60);
    const again = await progressRow(u.id, '1.1.1');
    expect(again).toMatchObject({ status: 'COMPLETED', best_score_percent: 80, attempts_count: 2 });
    expect(again.completed_at).toEqual(first.completed_at);
    const r = await drill(u.id, '1.1.1', 80);
    expect(r.unlocked).toEqual([]);
  });

  it('pass_percent set override: 90 dibutuhkan walau passing sub-modul 75', async () => {
    await publish('1.1.1', '1.1.2');
    await db.insert(assessmentSets).values({ assessmentType: 'ACTIVE_DRILL', title: 'd', subModuleId: await subId('1.1.1'), timeLimitSeconds: 300, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED', passPercent: 90 });
    const u = await newUser();
    await getTree(u.id);
    await drill(u.id, '1.1.1', 85);
    expect((await progressRow(u.id, '1.1.1')).status).toBe('IN_PROGRESS');
    await drill(u.id, '1.1.1', 90);
    expect((await progressRow(u.id, '1.1.1')).status).toBe('COMPLETED');
  });

  it('rantai melewati sub-modul DRAFT: 1.1.3 UNLOCKED setelah 1.1.1 selesai; 1.1.2 COMING_SOON', async () => {
    await publish('1.1.1', '1.1.3');
    const u = await newUser();
    await getTree(u.id);
    await drill(u.id, '1.1.1', 100);
    const t = await getTree(u.id);
    expect(sub(t, '1.1.3').status).toBe('UNLOCKED');
    expect(sub(t, '1.1.2').content_state).toBe('COMING_SOON');
  });

  it('skor di luar rentang atau bukan angka melempar error (500 internal), tidak mengubah data', async () => {
    await publish('1.1.1');
    const u = await newUser();
    await getTree(u.id);
    await expect(drill(u.id, '1.1.1', 100.5)).rejects.toThrow();
    await expect(drill(u.id, '1.1.1', -1)).rejects.toThrow();
    await expect(drill(u.id, '1.1.1', 'abc')).rejects.toThrow();
    expect((await progressRow(u.id, '1.1.1')).attempts_count).toBe(0);
  });

  it('10 panggilan serentak: tanpa deadlock, attempts_count = 10', async () => {
    await publish('1.1.1', '1.1.2');
    const u = await newUser();
    await getTree(u.id);
    await Promise.all(Array.from({ length: 10 }, (_, i) => drill(u.id, '1.1.1', 10 + i)));
    expect((await progressRow(u.id, '1.1.1')).attempts_count).toBe(10);
  });

  it('COMPLETED tidak turun ketika modul mendapat sub-modul baru; sub-modul diarsipkan hilang dari tree tetapi progres dipertahankan', async () => {
    await publish('1.1.1');
    const u = await newUser();
    await getTree(u.id);
    await drill(u.id, '1.1.1', 100);
    await publish('1.1.2');
    let t = await getTree(u.id);
    expect(sub(t, '1.1.1').status).toBe('COMPLETED');
    expect(mod(t, '1.1').status).toBe('COMPLETED'); // lengket (D5)
    await db.execute(sql`UPDATE sub_modules SET status = 'ARCHIVED' WHERE sub_module_code = '1.1.1'`);
    t = await getTree(u.id);
    expect(sub(t, '1.1.1')).toBeUndefined();
    expect((await progressRow(u.id, '1.1.1')).status).toBe('COMPLETED');
  });
});

describe('assertSubModuleAccessible dan markStarted', () => {
  it('LOCKED -> LOCKED_CONTENT (403) dengan details; ARCHIVED/tak dikenal -> NOT_FOUND; UNLOCKED lolos', async () => {
    await publish('1.1.1', '1.1.2', '2.1.1');
    const u = await newUser();
    const run = (id: string) => db.transaction((tx) => assertSubModuleAccessible(tx, u.id, id));
    expect((await run(await subId('1.1.1'))).subModule.code).toBe('1.1.1');
    await expect(run(await subId('1.1.2'))).rejects.toMatchObject({ code: 'LOCKED_CONTENT', status: 403, details: [{ path: 'sub_module_id', code: 'PREVIOUS_INCOMPLETE' }] });
    await expect(run(await subId('2.1.1'))).rejects.toMatchObject({ code: 'LOCKED_CONTENT', details: [{ code: 'TIER_LOCKED' }] });
    await expect(run(await subId('1.1.3'))).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    await expect(run('7a1b2c3d-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await db.execute(sql`UPDATE sub_modules SET status = 'ARCHIVED' WHERE sub_module_code = '1.1.1'`);
    await expect(run(await subId('1.1.1'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('markStarted: UNLOCKED -> IN_PROGRESS; modul dan Tier ikut IN_PROGRESS; idempoten', async () => {
    await publish('1.1.1', '1.1.2');
    const u = await newUser();
    await getTree(u.id);
    await db.transaction((tx) => markStarted(tx, u.id, '00000000-0000-4000-8000-000000000000'));
    const id = await subId('1.1.1');
    await db.transaction((tx) => markStarted(tx, u.id, id));
    await db.transaction((tx) => markStarted(tx, u.id, id));
    const t = await getTree(u.id);
    expect(sub(t, '1.1.1').status).toBe('IN_PROGRESS');
    expect(mod(t, '1.1').status).toBe('IN_PROGRESS');
    expect(tier(t, 1).status).toBe('IN_PROGRESS');
  });
});

describe('Boss, Skip, Placement', () => {
  it('boss tersedia saat semua modul selesai; lulus -> Tier 1 COMPLETED, Tier 2 UNLOCKED(BOSS_PASS) beserta sub pertamanya', async () => {
    await publish('1.1.1', '2.1.1');
    const boss = await addSet('TIER_BOSS_EXAM', 1);
    const u = await newUser();
    await getTree(u.id);
    let t = await getTree(u.id);
    expect(tier(t, 1).boss).toMatchObject({ available: false, blocked_reason: 'MODULES_INCOMPLETE', assessment_set_id: boss.id });
    await drill(u.id, '1.1.1', 100);
    t = await getTree(u.id);
    expect(tier(t, 1).boss).toMatchObject({ available: true, blocked_reason: null, assessment_set_id: boss.id });

    const tid = await tierId(1);
    await db.transaction((tx) => applyBossResult(tx, u.id, { tierId: tid, percent: 70, band: null, passed: false }));
    t = await getTree(u.id);
    expect(tier(t, 1).boss).toMatchObject({ best_percent: 70, passed_at: null });
    expect(tier(t, 1).status).not.toBe('COMPLETED');
    expect(tier(t, 2).status).toBe('LOCKED');

    const r = await db.transaction((tx) => applyBossResult(tx, u.id, { tierId: tid, percent: 85, band: null, passed: true }));
    expect(r.unlocked.map((x) => x.kind)).toEqual(['TIER', 'MODULE', 'SUB_MODULE']);
    t = await getTree(u.id);
    expect(tier(t, 1)).toMatchObject({ status: 'COMPLETED', progress_percent: 100 });
    expect(tier(t, 1).boss).toMatchObject({ available: false, blocked_reason: 'ALREADY_PASSED', best_percent: 85 });
    expect(tier(t, 1).boss.passed_at).not.toBeNull();
    expect(tier(t, 2)).toMatchObject({ status: 'UNLOCKED', unlock_source: 'BOSS_PASS' });
    expect(sub(t, '2.1.1')).toMatchObject({ status: 'UNLOCKED' });
    expect((await progressRow(u.id, '2.1.1')).unlock_source).toBe('BOSS_PASS');
  });

  it('skip Modul 2.1: sub dan modul SKIPPED(SKIP_TEST), skip_best 90, sub pertama modul berikutnya UNLOCKED; skip ulang no-op', async () => {
    await publish('2.1.1', '2.1.2', '2.2.1');
    const set = await addSet('SKIP_MODULE_TEST', '2.1');
    const u = await newUser();
    let t = await getTree(u.id);
    expect(mod(t, '2.1').skip_test).toMatchObject({ available: true, assessment_set_id: set.id, threshold_percent: 85, time_limit_seconds: 900, question_count: 12 });
    const mid = await moduleId('2.1');
    const r = await db.transaction((tx) => applySkipResult(tx, u.id, { scope: 'MODULE', targetId: mid, scorePercent: 90, passed: true }));
    expect(r.unlocked.length).toBeGreaterThanOrEqual(4);
    t = await getTree(u.id);
    expect(mod(t, '2.1').status).toBe('SKIPPED');
    expect(sub(t, '2.1.1').status).toBe('SKIPPED');
    expect(sub(t, '2.1.2').status).toBe('SKIPPED');
    expect(sub(t, '2.2.1').status).toBe('UNLOCKED');
    expect((await progressRow(u.id, '2.1.1')).unlock_source).toBe('SKIP_TEST');
    expect(Number((await db.execute(sql`SELECT skip_best_percent FROM user_module_progress WHERE user_id = ${u.id}::uuid AND module_id = ${mid}::uuid`)).rows[0]!.skip_best_percent)).toBe(90);
    const again = await db.transaction((tx) => applySkipResult(tx, u.id, { scope: 'MODULE', targetId: mid, scorePercent: 95, passed: true }));
    expect(again.unlocked).toEqual([]);
  });

  it('skip gagal hanya mencatat skip_best; modul dengan sub IN_PROGRESS -> skip_test.available=false', async () => {
    await publish('2.1.1', '2.1.2');
    await addSet('SKIP_MODULE_TEST', '2.1');
    const u = await newUser();
    await getTree(u.id);
    const mid = await moduleId('2.1');
    await db.transaction((tx) => applySkipResult(tx, u.id, { scope: 'MODULE', targetId: mid, scorePercent: 60, passed: false }));
    expect((await progressRow(u.id, '2.1.1')).status).toBe('LOCKED');
    expect(Number((await db.execute(sql`SELECT skip_best_percent FROM user_module_progress WHERE user_id = ${u.id}::uuid AND module_id = ${mid}::uuid`)).rows[0]!.skip_best_percent)).toBe(60);

    await publish('1.1.1');
    const v = await newUser();
    await getTree(v.id);
    await db.transaction((tx) => markStarted(tx, v.id, '00000000-0000-4000-8000-000000000000'));
    await addSet('SKIP_MODULE_TEST', '1.1');
    await db.transaction(async (tx) => markStarted(tx, v.id, await subId('1.1.1')));
    const t = await getTree(v.id);
    expect(mod(t, '1.1').skip_test.available).toBe(false);
  });

  it('skip Tier 2: seluruh isi SKIPPED, Tier 3 UNLOCKED(SKIP_TEST)', async () => {
    await publish('2.1.1', '2.2.1', '3.1.1');
    await addSet('SKIP_TIER_TEST', 2);
    const u = await newUser();
    await getTree(u.id);
    const tid = await tierId(2);
    await db.transaction((tx) => applySkipResult(tx, u.id, { scope: 'TIER', targetId: tid, scorePercent: 88, passed: true }));
    const t = await getTree(u.id);
    expect(tier(t, 2)).toMatchObject({ status: 'SKIPPED', progress_percent: 100 });
    expect(sub(t, '2.1.1').status).toBe('SKIPPED');
    expect(sub(t, '2.2.1').status).toBe('SKIPPED');
    expect(tier(t, 3)).toMatchObject({ status: 'UNLOCKED', unlock_source: 'SKIP_TEST' });
    expect(sub(t, '3.1.1').status).toBe('UNLOCKED');
  });

  it('placement tier 3: Tier 1-2 SKIPPED(PLACEMENT), Tier 3 UNLOCKED, placement_completed_at terisi', async () => {
    await publish('1.1.1', '2.1.1', '3.1.1');
    const u = await newUser();
    await getTree(u.id);
    await db.transaction((tx) => applyPlacementResult(tx, u.id, { tierNumber: 3 }));
    const t = await getTree(u.id);
    expect(tier(t, 1).status).toBe('SKIPPED');
    expect(tier(t, 2).status).toBe('SKIPPED');
    expect(tier(t, 3)).toMatchObject({ status: 'UNLOCKED', unlock_source: 'PLACEMENT' });
    expect(sub(t, '1.1.1').status).toBe('SKIPPED');
    expect(sub(t, '3.1.1').status).toBe('UNLOCKED');
    expect((await progressRow(u.id, '1.1.1')).unlock_source).toBe('PLACEMENT');
    expect((await db.select().from(users).where(eq(users.id, u.id)))[0]!.placementCompletedAt).not.toBeNull();
    await expect(db.transaction((tx) => applyPlacementResult(tx, u.id, { tierNumber: 5 }))).rejects.toThrow();
  });
});

describe('override progres (CLI progress:unlock memakai fungsi ini)', () => {
  const override = (userId: string, level: 'TIER' | 'MODULE' | 'SUB_MODULE', targetId: string) =>
    db.transaction((tx) => adminOverride(tx, null, userId, { level, targetId }));

  it('sub-modul LOCKED -> UNLOCKED(ADMIN) + audit; sudah terbuka ALREADY_UNLOCKED; COMING_SOON NOT_AVAILABLE; target/user tak ada NOT_FOUND', async () => {
    await publish('1.1.1', '1.1.2');
    const l = await newUser();
    await getTree(l.id);
    const target = await subId('1.1.2');

    const ok = await override(l.id, 'SUB_MODULE', target);
    expect(ok).toEqual({ level: 'SUB_MODULE', targetId: target, status: 'UNLOCKED', unlockSource: 'ADMIN' });
    expect((await progressRow(l.id, '1.1.2')).unlock_source).toBe('ADMIN');
    const logs = await db.select().from(auditLog).where(sql`${auditLog.action} = 'PROGRESS_OVERRIDE' AND ${auditLog.entityId} = ${l.id}`);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.actorUserId).toBeNull();
    await expect(override(l.id, 'SUB_MODULE', target)).rejects.toMatchObject({ code: 'ALREADY_UNLOCKED' });
    await expect(override(l.id, 'SUB_MODULE', await subId('1.1.3'))).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
    await expect(override(l.id, 'SUB_MODULE', '7a1b2c3d-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(override('7a1b2c3d-0000-4000-8000-000000000000', 'SUB_MODULE', target)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('override Tier: Tier UNLOCKED(ADMIN) dan sub pertama chain ikut terbuka', async () => {
    await publish('1.1.1', '2.1.1', '2.1.2');
    const l = await newUser();
    await getTree(l.id);
    const tid = await tierId(2);
    await override(l.id, 'TIER', tid);
    const t = await getTree(l.id);
    expect(tier(t, 2)).toMatchObject({ status: 'UNLOCKED', unlock_source: 'ADMIN' });
    expect(sub(t, '2.1.1').status).toBe('UNLOCKED');
    expect(sub(t, '2.1.2').status).toBe('LOCKED');
  });
});

describe('GET /curriculum/tree', () => {
  it('akun DISABLED -> 401; tanpa sesi 401', async () => {
    const l = await learnerSession();
    await db.update(users).set({ status: 'DISABLED' }).where(eq(users.id, l.user.id));
    expect((await call(treeGet, 'GET', '/api/v1/curriculum/tree', { cookie: l.cookie })).status).toBe(401);
    expect((await call(treeGet, 'GET', '/api/v1/curriculum/tree')).status).toBe(401);
  });

  it('respons sesuai kontrak (CurriculumTreeResponseSchema) dan no-store', async () => {
    await publish('1.1.1');
    const l = await learnerSession();
    const r = await call(treeGet, 'GET', '/api/v1/curriculum/tree', { cookie: l.cookie });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    const { CurriculumTreeResponseSchema } = await import('@/contracts/curriculum');
    expect(CurriculumTreeResponseSchema.safeParse(r.json).success).toBe(true);
  });

  it('kinerja: 4 Tier x 33 sub-modul, keadaan tunak <= 8 query SQL dan p95 < 300 ms', async () => {
    await publish(...(await db.execute(sql`SELECT sub_module_code AS c FROM sub_modules`)).rows.map((r) => (r as { c: string }).c));
    const l = await learnerSession();
    await call(treeGet, 'GET', '/api/v1/curriculum/tree', { cookie: l.cookie }); // hangatkan + buat progres
    const original = pg.Client.prototype.query;
    let queries = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pg.Client.prototype as any).query = function (this: unknown, ...args: unknown[]) {
      queries++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (original as any).apply(this, args);
    };
    const times: number[] = [];
    let perCall = 0;
    try {
      for (let i = 0; i < 20; i++) {
        resetRateLimits();
        const before = queries;
        const s = performance.now();
        const r = await call(treeGet, 'GET', '/api/v1/curriculum/tree', { cookie: l.cookie });
        times.push(performance.now() - s);
        expect(r.status).toBe(200);
        perCall = queries - before;
      }
    } finally {
      pg.Client.prototype.query = original;
    }
    times.sort((a, b) => a - b);
    // Termasuk query autentikasi (requireUser) dan BEGIN/COMMIT transaksi.
    console.log(`[perf] tree: ${perCall} query/permintaan, p95=${times[18]!.toFixed(1)} ms`);
    expect(times[18]!).toBeLessThan(300);
    expect(perCall).toBeLessThanOrEqual(8);
  });
});
