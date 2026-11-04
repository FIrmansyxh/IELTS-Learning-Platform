/**
 * Integrasi SPEC-020 (TASK-020): kurasi konten admin. Route handler nyata + Postgres. Fixture konten sintetis
 * (BUKAN Golden Sample); jam server dikendalikan untuk uji kelayakan hidup attempt (K3).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { assessmentSets, attempts, tiers } from '@/db/schema';
import {
  ChangeStatusResponseSchema,
  CurriculumResponseSchema,
  MaterialUpdatedResponseSchema,
  ModuleUpdatedResponseSchema,
  QualityResponseSchema,
  QuestionUpdatedResponseSchema,
  RevisionDetailResponseSchema,
  RevisionListResponseSchema,
  SetDetailResponseSchema,
  SetListResponseSchema,
  SetUpdatedResponseSchema,
  SubModuleDetailResponseSchema,
  SubModuleUpdatedResponseSchema,
} from '@/contracts/curation';
import { setClockForTest } from '@/server/clock';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { GET as curriculumRoute } from '@/app/api/v1/admin/curriculum/route';
import { GET as subGet, PATCH as subPatch } from '@/app/api/v1/admin/sub-modules/[sub_module_id]/route';
import { PATCH as materialPatch } from '@/app/api/v1/admin/sub-modules/[sub_module_id]/material/route';
import { PATCH as modulePatch } from '@/app/api/v1/admin/modules/[module_id]/route';
import { GET as setsList } from '@/app/api/v1/admin/assessment-sets/route';
import { GET as setGet, PATCH as setPatch } from '@/app/api/v1/admin/assessment-sets/[set_id]/route';
import { PATCH as questionPatch } from '@/app/api/v1/admin/assessment-sets/[set_id]/questions/[question_id]/route';
import { GET as qualityGet } from '@/app/api/v1/admin/assessment-sets/[set_id]/quality/route';
import { POST as statusPost } from '@/app/api/v1/admin/[entity]/[id]/status/route';
import { GET as revisionsList } from '@/app/api/v1/admin/content-revisions/route';
import { GET as revisionGet } from '@/app/api/v1/admin/content-revisions/[revision_id]/route';
import { GET as treeGet } from '@/app/api/v1/curriculum/tree/route';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { PUT as putRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as submitRoute } from '@/app/api/v1/attempts/[attempt_id]/submit/route';
import { call, adminSession, learnerSession } from './helpers';
import { addDrill, addFileAsset, markLearnDone, resetLearning, seedMaterial, subId } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = getDb();
type A = Awaited<ReturnType<typeof adminSession>>;

const T0 = Date.parse('2026-11-03T03:00:00.000Z');

const get = (a: A, route: any, url: string, params: Record<string, string> = {}) => call(route, 'GET', url, { cookie: a.cookie, params });
const patch = (a: A, route: any, url: string, params: Record<string, string>, body: unknown) => call(route, 'PATCH', url, { cookie: a.cookie, params, body });
const status = (a: A, entity: string, id: string, body: unknown) =>
  call(statusPost, 'POST', `/api/v1/admin/${entity}/${id}/status`, { cookie: a.cookie, params: { entity, id }, body });
const setPatchReq = (a: A, id: string, body: unknown) => patch(a, setPatch, `/api/v1/admin/assessment-sets/${id}`, { set_id: id }, body);
const qPatch = (a: A, setId: string, qid: string, body: unknown) =>
  patch(a, questionPatch, `/api/v1/admin/assessment-sets/${setId}/questions/${qid}`, { set_id: setId, question_id: qid }, body);
const subPatchReq = (a: A, id: string, body: unknown) => patch(a, subPatch, `/api/v1/admin/sub-modules/${id}`, { sub_module_id: id }, body);
const materialPatchReq = (a: A, id: string, body: unknown) => patch(a, materialPatch, `/api/v1/admin/sub-modules/${id}/material`, { sub_module_id: id }, body);

const mcqs = (n: number, over: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) =>
    Q.mcq({ question_id: `Q-C${i + 1}`, prompt: `P${i + 1}`, options: [`right-${i + 1}`, 'x', 'y', 'z'], correct_answers: [`right-${i + 1}`], explanation_id: `Pembahasan ${i + 1}`, ...over }),
  );
const draftDrill = (code: string, qs: unknown[] = mcqs(3), over: Partial<typeof assessmentSets.$inferInsert> = {}) => addDrill(code, qs, { status: 'DRAFT', ...over });
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as any[];
const setRow = async (id: string) => (await rows(sql`SELECT * FROM assessment_sets WHERE id = ${id}::uuid`))[0];
const revisions = (type: string, id: string) => rows(sql`SELECT version, snapshot, changed_by FROM content_revisions WHERE entity_type = ${type} AND entity_id = ${id}::uuid ORDER BY version`);
const auditOf = (action: string, entityId: string) => rows(sql`SELECT metadata, actor_user_id FROM audit_log WHERE action = ${action} AND entity_id = ${entityId} ORDER BY id`);

async function setStatusDb(sub: string, st: string) {
  await db.execute(sql`UPDATE sub_modules SET status = ${st}::review_status WHERE sub_module_code = ${sub}`);
}

/** Nilai awal hasil seed untuk modul/sub-modul (tes ini mengubah judul, urutan, ambang, versi); dipulihkan tiap tes. */
let seedMods: Array<{ id: string; title: string; order_index: number }> = [];
let seedSubs: Array<{ id: string; title: string; order_index: number; passing_score_percent: number }> = [];
async function restoreSeed() {
  for (const m of seedMods) await db.execute(sql`UPDATE modules SET title = ${m.title}, order_index = ${m.order_index} WHERE id = ${m.id}::uuid`);
  for (const x of seedSubs) await db.execute(sql`UPDATE sub_modules SET title = ${x.title}, order_index = ${x.order_index}, passing_score_percent = ${x.passing_score_percent}, content_version = 1 WHERE id = ${x.id}::uuid`);
}
beforeAll(async () => {
  seedMods = (await rows(sql`SELECT id, title, order_index FROM modules`)) as typeof seedMods;
  seedSubs = (await rows(sql`SELECT id, title, order_index, passing_score_percent FROM sub_modules`)) as typeof seedSubs;
});

beforeEach(async () => {
  resetRateLimits();
  await restoreSeed();
  await resetLearning();
  await db.execute(sql`DELETE FROM content_revisions`);
  await db.execute(sql`DELETE FROM audit_log WHERE action IN ('CONTENT_EDITED', 'CONTENT_STATUS_CHANGED')`);
  setClockForTest(null);
});
afterEach(() => setClockForTest(null));
afterAll(async () => {
  await restoreSeed();
  await resetLearning();
  await db.execute(sql`DELETE FROM content_assets`);
  await db.execute(sql`DELETE FROM content_revisions`);
  await closeDb();
});

// =============================================================================== akses
describe('akses: hanya admin', () => {
  it('learner -> 403 FORBIDDEN (kunci jawaban tidak keluar); tanpa sesi -> 401, di semua endpoint', async () => {
    await seedMaterial('1.1.1');
    const set = await draftDrill('1.1.1');
    const learner = await learnerSession();
    const sid = await subId('1.1.1');
    const cases: Array<[any, string, string, Record<string, string>, unknown?]> = [
      [setGet, 'GET', `/api/v1/admin/assessment-sets/${set.id}`, { set_id: set.id }],
      [setsList, 'GET', '/api/v1/admin/assessment-sets', {}],
      [curriculumRoute, 'GET', '/api/v1/admin/curriculum', {}],
      [subGet, 'GET', `/api/v1/admin/sub-modules/${sid}`, { sub_module_id: sid }],
      [qualityGet, 'GET', `/api/v1/admin/assessment-sets/${set.id}/quality`, { set_id: set.id }],
      [revisionsList, 'GET', `/api/v1/admin/content-revisions?entity_type=ASSESSMENT_SET&entity_id=${set.id}`, {}],
      [setPatch, 'PATCH', `/api/v1/admin/assessment-sets/${set.id}`, { set_id: set.id }, { title: 'x' }],
      [statusPost, 'POST', `/api/v1/admin/assessment-sets/${set.id}/status`, { entity: 'assessment-sets', id: set.id }, { status: 'IN_REVIEW' }],
    ];
    for (const [route, method, url, params, body] of cases) {
      const r = await call(route, method, url, { cookie: learner.cookie, params, body });
      expect(r.status, url).toBe(403);
      expect(r.json.error.code).toBe('FORBIDDEN');
      expect(JSON.stringify(r.json)).not.toContain('correct_answers');
      expect((await call(route, method, url, { params, body })).status, url).toBe(401);
    }
    expect((await setRow(set.id)).title).toBe('Latihan 1.1.1');
  });

  it('mutasi tanpa Origin ditolak CSRF_ORIGIN_MISMATCH', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await draftDrill('1.1.1');
    const r = await call(setPatch, 'PATCH', `/api/v1/admin/assessment-sets/${set.id}`, { cookie: a.cookie, params: { set_id: set.id }, body: { title: 'x' }, headers: { origin: 'http://evil.example' } });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('CSRF_ORIGIN_MISMATCH');
  });
});

// =============================================================================== status (K1, K2, penghalang)
describe('POST /admin/{entity}/{id}/status', () => {
  it('set DRAFT tanpa penghalang -> PUBLISHED: reviewed_by/at terisi, audit CONTENT_STATUS_CHANGED (from DRAFT, to PUBLISHED)', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await draftDrill('1.1.1');
    const r = await status(a, 'assessment-sets', set.id, { status: 'PUBLISHED' });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(ChangeStatusResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data).toMatchObject({ id: set.id, entity: 'assessment-sets', status: 'PUBLISHED' });
    expect(typeof r.json.data.reviewed_at).toBe('string');
    const row = await setRow(set.id);
    expect(row.status).toBe('PUBLISHED');
    expect(row.reviewed_by).toBe(a.user.id);
    expect(row.reviewed_at).not.toBeNull();
    const au = await auditOf('CONTENT_STATUS_CHANGED', set.id);
    expect(au).toHaveLength(1);
    expect(au[0].metadata).toMatchObject({ entity: 'assessment-sets', id: set.id, from: 'DRAFT', to: 'PUBLISHED' });
    expect(au[0].actor_user_id).toBe(a.user.id);
  });

  it('origin AI_GENERATED_REVIEWED: tanpa confirm_reviewed -> 409 REVIEW_CONFIRMATION_REQUIRED; dengan true -> 200 (confirmed_by di audit)', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await draftDrill('1.1.1', mcqs(3), { origin: 'AI_GENERATED_REVIEWED' });
    for (const body of [{ status: 'PUBLISHED' }, { status: 'PUBLISHED', confirm_reviewed: false }]) {
      const r = await status(a, 'assessment-sets', set.id, body);
      expect(r.status).toBe(409);
      expect(r.json.error.code).toBe('REVIEW_CONFIRMATION_REQUIRED');
    }
    expect((await setRow(set.id)).status).toBe('DRAFT');
    const ok = await status(a, 'assessment-sets', set.id, { status: 'PUBLISHED', confirm_reviewed: true });
    expect(ok.status).toBe(200);
    expect((await auditOf('CONTENT_STATUS_CHANGED', set.id))[0].metadata).toMatchObject({ confirmed_by: a.user.id });
    // konfirmasi tidak diperlukan untuk transisi lain
    const draft = await status(a, 'assessment-sets', set.id, { status: 'DRAFT' });
    expect(draft.status).toBe(200);
  });

  it('K2 untuk sub-modul memakai origin materi', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    await db.execute(sql`UPDATE learning_materials SET origin = 'AI_GENERATED_REVIEWED'`);
    await addDrill('1.1.1', mcqs(2));
    await setStatusDb('1.1.1', 'DRAFT');
    const sid = await subId('1.1.1');
    const r = await status(a, 'sub-modules', sid, { status: 'PUBLISHED' });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('REVIEW_CONFIRMATION_REQUIRED');
    expect((await status(a, 'sub-modules', sid, { status: 'PUBLISHED', confirm_reviewed: true })).status).toBe(200);
  });

  it('sub-modul dengan aset UNVERIFIED -> 409 PUBLISH_BLOCKED (details[0].code ASSET_UNVERIFIED); setelah diverifikasi -> 200', async () => {
    const a = await adminSession();
    const { slideAssets } = await seedMaterial('1.1.1', { slides: 1 });
    await addDrill('1.1.1', mcqs(2)); // PUBLISHED
    await setStatusDb('1.1.1', 'DRAFT');
    await db.execute(sql`UPDATE content_assets SET rights_status = 'UNVERIFIED' WHERE id = ${slideAssets[0]!}::uuid`);
    const sid = await subId('1.1.1');
    const r = await status(a, 'sub-modules', sid, { status: 'PUBLISHED' });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('PUBLISH_BLOCKED');
    expect(r.json.error.details[0]).toMatchObject({ code: 'ASSET_UNVERIFIED', path: `SUB_MODULE:${sid}` });
    expect((await rows(sql`SELECT status FROM sub_modules WHERE id = ${sid}::uuid`))[0].status).toBe('DRAFT');
    await db.execute(sql`UPDATE content_assets SET rights_status = 'OWN_ORIGINAL' WHERE id = ${slideAssets[0]!}::uuid`);
    const ok = await status(a, 'sub-modules', sid, { status: 'PUBLISHED' });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    expect(ok.json.data.reviewed_at).toBeNull();
  });

  it('sub-modul tanpa drill PUBLISHED -> 409 PUBLISH_BLOCKED DRILL_NOT_PUBLISHED; set UNVERIFIED listening -> blocker set', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    await draftDrill('1.1.1'); // drill masih DRAFT
    await setStatusDb('1.1.1', 'DRAFT');
    const sid = await subId('1.1.1');
    const r = await status(a, 'sub-modules', sid, { status: 'PUBLISHED' });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('PUBLISH_BLOCKED');
    expect(r.json.error.details.map((d: any) => d.code)).toContain('DRILL_NOT_PUBLISHED');
    // set dengan audio listening UNVERIFIED
    const { asset } = await addFileAsset({ kind: 'AUDIO_LISTENING', mime: 'audio/mpeg', ext: 'mp3' });
    await db.execute(sql`UPDATE content_assets SET rights_status = 'UNVERIFIED' WHERE id = ${asset.id}::uuid`);
    const s2 = await draftDrill('1.1.1', mcqs(2), { listeningAssetId: asset.id, title: 'Dengan audio' });
    const r2 = await status(a, 'assessment-sets', s2.id, { status: 'PUBLISHED' });
    expect(r2.status).toBe(409);
    expect(r2.json.error.details[0]).toMatchObject({ code: 'ASSET_UNVERIFIED', path: `ASSESSMENT_SET:${s2.id}` });
  });

  it('K1: DRAFT -> ARCHIVED 409; DRAFT -> APPROVED 409; status sama 409; ARCHIVED -> PUBLISHED 409; ARCHIVED -> DRAFT 200; jalur normal berjalan', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await draftDrill('1.1.1');
    const go = (to: string, extra: object = {}) => status(a, 'assessment-sets', set.id, { status: to, ...extra });
    for (const bad of ['ARCHIVED', 'APPROVED', 'DRAFT']) {
      const r = await go(bad);
      expect(r.status, bad).toBe(409);
      expect(r.json.error.code).toBe('INVALID_STATUS_TRANSITION');
    }
    expect((await go('IN_REVIEW')).status).toBe(200);
    expect((await go('APPROVED')).status).toBe(200);
    expect((await go('PUBLISHED')).status).toBe(200);
    expect((await go('ARCHIVED')).status).toBe(200);
    const bad = await go('PUBLISHED');
    expect(bad.status).toBe(409);
    expect(bad.json.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect((await go('IN_REVIEW')).status).toBe(409);
    expect((await go('DRAFT')).status).toBe(200);
    expect((await setRow(set.id)).status).toBe('DRAFT');
    // pintasan dan kembali ke DRAFT dari IN_REVIEW / APPROVED
    expect((await go('IN_REVIEW')).status).toBe(200);
    expect((await go('DRAFT')).status).toBe(200);
  });

  it('modul: PUBLISHED tanpa penghalang; modul tidak punya origin (tanpa K2)', async () => {
    const a = await adminSession();
    const [m] = await rows(sql`SELECT id FROM modules WHERE module_code = '1.1'`);
    const r = await status(a, 'modules', m.id, { status: 'PUBLISHED' });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ entity: 'modules', status: 'PUBLISHED', reviewed_at: null });
    expect((await status(a, 'modules', m.id, { status: 'ARCHIVED' })).status).toBe(200);
  });

  it('entity di luar daftar (tiers, users) -> 404 NOT_FOUND; id tidak ada -> 404; body tidak valid -> 400', async () => {
    const a = await adminSession();
    const id = '7a1b2c3d-0000-4000-8000-000000000000';
    const [t] = await db.select().from(tiers);
    for (const entity of ['tiers', 'users']) {
      const r = await status(a, entity, t!.id, { status: 'PUBLISHED' });
      expect(r.status, entity).toBe(404);
      expect(r.json.error.code).toBe('NOT_FOUND');
    }
    expect((await status(a, 'assessment-sets', id, { status: 'IN_REVIEW' })).status).toBe(404);
    expect((await status(a, 'modules', id, { status: 'IN_REVIEW' })).status).toBe(404);
    expect((await status(a, 'sub-modules', id, { status: 'IN_REVIEW' })).status).toBe(404);
    const bad = await status(a, 'modules', id, { status: 'BOGUS' });
    expect(bad.status).toBe(400);
    expect((await status(a, 'modules', id, { status: 'DRAFT', extra: 1 })).status).toBe(400);
  });

  it('sub-modul PUBLISHED diarsipkan: hilang dari /curriculum/tree Learner, baris progres tetap', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    await addDrill('1.1.1', mcqs(2));
    const learner = await learnerSession();
    const tree = async () => (await call(treeGet, 'GET', '/api/v1/curriculum/tree', { cookie: learner.cookie })).json.data;
    const codes = (t: any) => t.tiers.flatMap((x: any) => x.modules.flatMap((m: any) => m.sub_modules.map((s: any) => s.sub_module_code)));
    expect(codes(await tree())).toContain('1.1.1');
    const before = await rows(sql`SELECT count(*)::int AS n FROM user_sub_module_progress WHERE user_id = ${learner.user.id}::uuid`);
    const r = await status(a, 'sub-modules', await subId('1.1.1'), { status: 'ARCHIVED' });
    expect(r.status).toBe(200);
    expect(codes(await tree())).not.toContain('1.1.1');
    expect(await rows(sql`SELECT count(*)::int AS n FROM user_sub_module_progress WHERE user_id = ${learner.user.id}::uuid`)).toEqual(before);
    expect(await rows(sql`SELECT 1 FROM user_sub_module_progress p JOIN sub_modules s ON s.id = p.sub_module_id WHERE p.user_id = ${learner.user.id}::uuid AND s.sub_module_code = '1.1.1'`)).toHaveLength(1);
  });

  it('set PUBLISHED -> DRAFT/ARCHIVED saat ada attempt berjalan -> 409 SET_HAS_ACTIVE_ATTEMPTS; setelah selesai -> 200', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', mcqs(3));
    const l = await learnerSession();
    await markLearnDone(l.user.id, '1.1.1');
    const s = await call(startRoute, 'POST', '/api/v1/attempts', { cookie: l.cookie, body: { assessment_set_id: set.id } });
    expect(s.status).toBe(201);
    for (const to of ['DRAFT', 'ARCHIVED']) {
      const r = await status(a, 'assessment-sets', set.id, { status: to });
      expect(r.status, to).toBe(409);
      expect(r.json.error.code).toBe('SET_HAS_ACTIVE_ATTEMPTS');
    }
    expect((await setRow(set.id)).status).toBe('PUBLISHED');
    await call(submitRoute, 'POST', `/api/v1/attempts/${s.json.data.id}/submit`, { cookie: l.cookie, params: { attempt_id: s.json.data.id } });
    expect((await status(a, 'assessment-sets', set.id, { status: 'DRAFT' })).status).toBe(200);
  });

  it('Placement PUBLISHED diturunkan ke DRAFT tanpa attempt berjalan: diizinkan', async () => {
    const a = await adminSession();
    const [p] = await db.insert(assessmentSets).values({ assessmentType: 'PLACEMENT_TEST', title: 'Placement', timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' }).returning();
    expect((await status(a, 'assessment-sets', p!.id, { status: 'DRAFT' })).status).toBe(200);
  });
});

// =============================================================================== metadata modul / sub-modul
describe('PATCH modul dan sub-modul (K4)', () => {
  it('sub-modul passing_score_percent=80: 200, content_version +1, revisi menyimpan snapshot LAMA pada version sebelumnya; 0 dan 101 -> 400', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const sid = await subId('1.1.1');
    const r = await subPatchReq(a, sid, { passing_score_percent: 80 });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(SubModuleUpdatedResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data).toMatchObject({ id: sid, sub_module_code: '1.1.1', passing_score_percent: 80, content_version: 2, status: 'PUBLISHED' });
    const rev = await revisions('SUB_MODULE', sid);
    expect(rev).toHaveLength(1);
    expect(rev[0]).toMatchObject({ version: 1, changed_by: a.user.id });
    expect(rev[0].snapshot).toMatchObject({ passing_score_percent: 75 });
    expect(rev[0].snapshot.materials.article_markdown).toContain('artikel');
    for (const bad of [0, 101, -3, 80.5]) expect((await subPatchReq(a, sid, { passing_score_percent: bad })).status, String(bad)).toBe(400);
    expect((await rows(sql`SELECT content_version, passing_score_percent FROM sub_modules WHERE id = ${sid}::uuid`))[0]).toEqual({ content_version: 2, passing_score_percent: 80 });
    // revisi kedua: snapshot versi 2 (sebelum perubahan kedua)
    await subPatchReq(a, sid, { title: 'Judul Baru' });
    const rev2 = await revisions('SUB_MODULE', sid);
    expect(rev2.map((x) => x.version)).toEqual([1, 2]);
    expect(rev2[1].snapshot).toMatchObject({ title: expect.not.stringContaining('Judul Baru'), passing_score_percent: 80 });
    // perubahan sama (idempoten): tanpa kenaikan versi
    const same = await subPatchReq(a, sid, { title: 'Judul Baru' });
    expect(same.json.data.content_version).toBe(3);
  });

  it('mengubah passing_score_percent tidak mengubah status progres yang sudah ada', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const l = await learnerSession();
    await markLearnDone(l.user.id, '1.1.1');
    await call(treeGet, 'GET', '/api/v1/curriculum/tree', { cookie: l.cookie });
    const st = () => rows(sql`SELECT p.status FROM user_sub_module_progress p JOIN sub_modules s ON s.id = p.sub_module_id WHERE p.user_id = ${l.user.id}::uuid AND s.sub_module_code = '1.1.1'`);
    const before = await st();
    await subPatchReq(a, await subId('1.1.1'), { passing_score_percent: 50 });
    await call(treeGet, 'GET', '/api/v1/curriculum/tree', { cookie: l.cookie });
    expect(await st()).toEqual(before);
  });

  it('order_index bentrok -> 409 ORDER_INDEX_TAKEN dan tidak ada perubahan (sub-modul dan modul)', async () => {
    const a = await adminSession();
    const [s1, s2] = await rows(sql`SELECT id, order_index FROM sub_modules WHERE sub_module_code IN ('1.1.1', '1.1.2') ORDER BY sub_module_code`);
    const r = await subPatchReq(a, s1.id, { order_index: s2.order_index, title: 'Tidak boleh berubah' });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ORDER_INDEX_TAKEN');
    expect((await rows(sql`SELECT title, order_index FROM sub_modules WHERE id = ${s1.id}::uuid`))[0]).toMatchObject({ order_index: s1.order_index });
    expect((await rows(sql`SELECT title FROM sub_modules WHERE id = ${s1.id}::uuid`))[0].title).not.toBe('Tidak boleh berubah');
    const [m1, m2] = await rows(sql`SELECT id, order_index FROM modules WHERE module_code IN ('1.1', '1.2') ORDER BY module_code`);
    const rm = await patch(a, modulePatch, `/api/v1/admin/modules/${m1.id}`, { module_id: m1.id }, { order_index: m2.order_index });
    expect(rm.status).toBe(409);
    expect(rm.json.error.code).toBe('ORDER_INDEX_TAKEN');
    // nilai bebas diterima; order saja tidak menaikkan content_version
    const free = await subPatchReq(a, s1.id, { order_index: 99 });
    expect(free.status).toBe(200);
    expect(free.json.data).toMatchObject({ order_index: 99, content_version: 1 });
  });

  it('PATCH modul: judul/urutan, key terlarang (module_code, status) dan body kosong -> 400; order <= 0 -> 400', async () => {
    const a = await adminSession();
    const [m] = await rows(sql`SELECT id, order_index FROM modules WHERE module_code = '1.1'`);
    const url = `/api/v1/admin/modules/${m.id}`;
    const p = (body: unknown) => patch(a, modulePatch, url, { module_id: m.id }, body);
    const ok = await p({ title: 'Judul Modul Baru' });
    expect(ok.status).toBe(200);
    expect(ModuleUpdatedResponseSchema.safeParse(ok.json).success).toBe(true);
    expect(ok.json.data).toMatchObject({ id: m.id, module_code: '1.1', title: 'Judul Modul Baru', status: 'DRAFT' });
    for (const body of [{ module_code: '9.9' }, { status: 'PUBLISHED' }, {}, { order_index: 0 }, { order_index: -1 }, { title: '' }, { title: 'x'.repeat(151) }]) {
      const r = await p(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.json.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await p({})).json.error.details[0].code).toBe('empty_update');
    expect((await p({ module_code: '9.9' })).json.error.details[0].code).toBe('unrecognized_key');
    expect((await patch(a, modulePatch, '/api/v1/admin/modules/7a1b2c3d-0000-4000-8000-000000000000', { module_id: '7a1b2c3d-0000-4000-8000-000000000000' }, { title: 'x' })).status).toBe(404);
    expect((await auditOf('CONTENT_EDITED', m.id))[0].metadata).toMatchObject({ entity: 'module', fields: ['title'] });
  });
});

// =============================================================================== materi
describe('PATCH /admin/sub-modules/{id}/material', () => {
  it('<script> -> 400 raw_html_not_allowed; [x](javascript:...) -> 400 unsafe_link; data: juga ditolak; tanpa perubahan', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const sid = await subId('1.1.1');
    const before = (await rows(sql`SELECT article_markdown, content_version FROM learning_materials`))[0];
    const r1 = await materialPatchReq(a, sid, { article_markdown: 'Halo <script>alert(1)</script>' });
    expect(r1.status).toBe(400);
    expect(r1.json.error.details[0].code).toBe('raw_html_not_allowed');
    const r2 = await materialPatchReq(a, sid, { article_markdown: '[x](javascript:alert(1))' });
    expect(r2.status).toBe(400);
    expect(r2.json.error.details[0].code).toBe('unsafe_link');
    expect((await materialPatchReq(a, sid, { article_markdown: '[x](data:text/html;base64,AAAA)' })).json.error.details[0].code).toBe('unsafe_link');
    expect((await materialPatchReq(a, sid, { mini_task: { task_type: 'SELF_CHECK', prompt: '<img src=x onerror=1>', ai_rubric_criteria: 'k' } })).json.error.details[0].code).toBe('raw_html_not_allowed');
    expect((await rows(sql`SELECT article_markdown, content_version FROM learning_materials`))[0]).toEqual(before);
    // di dalam blok kode HTML diizinkan
    expect((await materialPatchReq(a, sid, { article_markdown: 'Contoh: `<b>`' })).status).toBe(200);
  });

  it('valid: 200 dengan content_version +1 (materi dan sub-modul), revisi SUB_MODULE + LEARNING_MATERIAL, audit hanya nama field', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const sid = await subId('1.1.1');
    const [lm] = await rows(sql`SELECT id FROM learning_materials`);
    const SECRET = 'Isi artikel baru yang rahasia 12345';
    const r = await materialPatchReq(a, sid, { article_markdown: SECRET, attribution_text: 'Atribusi baru', mini_task: { task_type: 'SELF_CHECK', prompt: 'Jelaskan.', ai_rubric_criteria: 'Lengkap' } });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(MaterialUpdatedResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data.content_version).toBe(2);
    expect(typeof r.json.data.updated_at).toBe('string');
    const m = (await rows(sql`SELECT * FROM learning_materials`))[0];
    expect(m).toMatchObject({ article_markdown: SECRET, attribution_text: 'Atribusi baru', content_version: 2 });
    expect(m.mini_task_json).toEqual({ task_type: 'SELF_CHECK', prompt: 'Jelaskan.', ai_rubric_criteria: 'Lengkap' });
    expect((await rows(sql`SELECT content_version FROM sub_modules WHERE id = ${sid}::uuid`))[0].content_version).toBe(2);
    expect((await revisions('SUB_MODULE', sid))[0]).toMatchObject({ version: 1 });
    const lr = await revisions('LEARNING_MATERIAL', lm.id);
    expect(lr[0].version).toBe(1);
    expect(lr[0].snapshot.articleMarkdown).toContain('artikel');
    const au = await auditOf('CONTENT_EDITED', lm.id);
    expect(au[0].metadata).toMatchObject({ entity: 'learning_material', fields: ['article_markdown', 'attribution_text', 'mini_task'] });
    expect(JSON.stringify(au)).not.toContain('rahasia');
    // hapus Mini-Task dan atribusi
    const del = await materialPatchReq(a, sid, { mini_task: null, attribution_text: null });
    expect(del.status).toBe(200);
    expect((await rows(sql`SELECT mini_task_json, attribution_text FROM learning_materials`))[0]).toEqual({ mini_task_json: {}, attribution_text: null });
    // body kosong / key tak dikenal / material tidak ada
    expect((await materialPatchReq(a, sid, {})).json.error.details[0].code).toBe('empty_update');
    expect((await materialPatchReq(a, sid, { origin: 'ORIGINAL_AUTHORED' })).json.error.details[0].code).toBe('unrecognized_key');
    expect((await materialPatchReq(a, await subId('1.1.2'), { article_markdown: 'x' })).status).toBe(404); // sub-modul tanpa materi
  });
});

// =============================================================================== soal dan set
describe('PATCH soal', () => {
  it('jawaban benar tidak ada di options -> 400 answer_not_in_options dan soal tidak berubah; perubahan valid -> 200 (version +1, hash berubah, revisi)', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', mcqs(3));
    const before = await setRow(set.id);
    const bad = await qPatch(a, set.id, 'Q-C2', { correct_answers: ['teks yang tidak ada'] });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe('VALIDATION_ERROR');
    expect(bad.json.error.details[0].code).toBe('answer_not_in_options');
    expect((await setRow(set.id)).questions_json).toEqual(before.questions_json);
    expect((await setRow(set.id)).version).toBe(1);

    const ok = await qPatch(a, set.id, 'Q-C2', { prompt: 'Manakah kalimat yang paling tepat untuk laporan akademik IELTS Writing Task 1?', correct_answers: ['x'] });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    expect(QuestionUpdatedResponseSchema.safeParse(ok.json).success).toBe(true);
    expect(ok.json.data.question).toMatchObject({ question_id: 'Q-C2', prompt: expect.stringContaining('laporan akademik'), correct_answers: ['x'] });
    expect(ok.json.data.set).toMatchObject({ id: set.id, version: 2 });
    expect(ok.json.data.set.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ok.json.data.set.content_hash).not.toBe(before.content_hash);
    const after = await setRow(set.id);
    expect(after.version).toBe(2);
    expect(after.content_hash).toBe(ok.json.data.set.content_hash);
    expect(after.questions_json[1].prompt).toContain('laporan akademik');
    expect(after.questions_json[0]).toEqual(before.questions_json[0]);
    expect(after.questions_json[2]).toEqual(before.questions_json[2]);
    const rev = await revisions('ASSESSMENT_SET', set.id);
    expect(rev).toHaveLength(1);
    expect(rev[0]).toMatchObject({ version: 1, changed_by: a.user.id });
    expect(rev[0].snapshot.questionsJson[1].prompt).toBe('P2'); // isi SEBELUM perubahan
    const au = await auditOf('CONTENT_EDITED', set.id);
    expect(au[0].metadata).toMatchObject({ entity: 'assessment_set', question_id: 'Q-C2', fields: ['prompt', 'correct_answers'] });
    expect(JSON.stringify(au)).not.toContain('laporan akademik');
    // tidak ada perubahan nyata -> tidak ada kenaikan versi
    const same = await qPatch(a, set.id, 'Q-C2', { points: 1 });
    expect(same.status).toBe(200);
    expect(same.json.data.set.version).toBe(2);
  });

  it('question_type / question_id / skill di body -> 400 unrecognized_key; options pada FILL_IN_BLANK -> 400 field_not_allowed_for_type', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', [Q.mcq({ question_id: 'Q-M1' }), Q.fill({ question_id: 'Q-F1' }), Q.writing({ question_id: 'Q-W1' }), Q.reorder({ question_id: 'Q-R1' })]);
    for (const k of ['question_type', 'question_id', 'skill']) {
      const r = await qPatch(a, set.id, 'Q-M1', { [k]: 'MCQ_MULTI', prompt: 'baru' });
      expect(r.status, k).toBe(400);
      expect(r.json.error.details[0].code).toBe('unrecognized_key');
    }
    const f = await qPatch(a, set.id, 'Q-F1', { options: ['a', 'b'] });
    expect(f.status).toBe(400);
    expect(f.json.error.details[0]).toMatchObject({ code: 'field_not_allowed_for_type', path: 'options' });
    // Writing: hanya prompt dan explanation_id
    const w = await qPatch(a, set.id, 'Q-W1', { points: 5 });
    expect(w.json.error.details[0].code).toBe('field_not_allowed_for_type');
    expect((await qPatch(a, set.id, 'Q-W1', { prompt: 'Tulis esai tentang transportasi.', explanation_id: 'Catatan' })).status).toBe(200);
    // reorder: correct_answers tidak berlaku; segments boleh
    expect((await qPatch(a, set.id, 'Q-R1', { correct_answers: ['x'] })).json.error.details[0].code).toBe('field_not_allowed_for_type');
    expect((await qPatch(a, set.id, 'Q-R1', { segments: ['A b', 'C d', 'E f'] })).status).toBe(200);
    // body kosong, soal tak ada, set tak ada
    expect((await qPatch(a, set.id, 'Q-M1', {})).json.error.details[0].code).toBe('empty_update');
    expect((await qPatch(a, set.id, 'Q-NOPE', { prompt: 'x' })).status).toBe(404);
    expect((await qPatch(a, '7a1b2c3d-0000-4000-8000-000000000000', 'Q-M1', { prompt: 'x' })).status).toBe(404);
  });

  it('validasi soal utuh: MCQ_MULTI terlalu sedikit jawaban, difficulty null pada Placement, target_time_ms null menghapus field', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', [Q.multi({ question_id: 'Q-U1', target_time_ms: 9000, difficulty: 2 }), Q.mcq({ question_id: 'Q-U2', target_time_ms: 9000 })]);
    const r = await qPatch(a, set.id, 'Q-U1', { correct_answers: ['a'] });
    expect(r.status).toBe(400); // MCQ_MULTI butuh >= 2
    const ok = await qPatch(a, set.id, 'Q-U2', { target_time_ms: null, difficulty: 3 });
    expect(ok.status).toBe(200);
    expect(ok.json.data.question.target_time_ms).toBeUndefined();
    expect(ok.json.data.question.difficulty).toBe(3);
    // Placement: difficulty wajib
    const [p] = await db.insert(assessmentSets).values({ assessmentType: 'PLACEMENT_TEST', title: 'Placement', timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'DRAFT', questionsJson: [Q.mcq({ question_id: 'Q-P1', difficulty: 2 })] as object[], questionCount: 1 }).returning();
    const np = await qPatch(a, p!.id, 'Q-P1', { difficulty: null });
    expect(np.status).toBe(400);
    expect(np.json.error.details[0].code).toBe('difficulty_required');
  });

  it('Learner melihat prompt baru pada drill setelah soal disunting dan set dipublikasikan', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await draftDrill('1.1.1', mcqs(2));
    expect((await qPatch(a, set.id, 'Q-C1', { prompt: 'Prompt hasil kurasi admin' })).status).toBe(200);
    expect((await status(a, 'assessment-sets', set.id, { status: 'PUBLISHED' })).status).toBe(200);
    const l = await learnerSession();
    await markLearnDone(l.user.id, '1.1.1');
    const s = await call(startRoute, 'POST', '/api/v1/attempts', { cookie: l.cookie, body: { assessment_set_id: set.id } });
    expect(s.status).toBe(201);
    expect(s.json.data.questions.map((q: any) => q.prompt)).toContain('Prompt hasil kurasi admin');
  });
});

describe('PATCH set (metadata, teks bacaan)', () => {
  it('judul/waktu/pass_percent: 200, version +1, hash berubah, revisi; rentang dilanggar -> 400; key tak dikenal -> 400', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', mcqs(3));
    const r = await setPatchReq(a, set.id, { title: 'Judul baru', time_limit_seconds: 900, pass_percent: 70 });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(SetUpdatedResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data).toMatchObject({ id: set.id, title: 'Judul baru', time_limit_seconds: 900, pass_percent: 70, version: 2 });
    expect(r.json.data.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await revisions('ASSESSMENT_SET', set.id))[0]).toMatchObject({ version: 1 });
    expect((await setPatchReq(a, set.id, { pass_percent: null })).json.data.pass_percent).toBeNull();
    for (const body of [{ time_limit_seconds: 29 }, { time_limit_seconds: 14401 }, { pass_percent: 0 }, { pass_percent: 101 }, { title: '' }, { status: 'PUBLISHED' }, {}]) {
      expect((await setPatchReq(a, set.id, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await setPatchReq(a, '7a1b2c3d-0000-4000-8000-000000000000', { title: 'x' })).status).toBe(404);
  });

  it('reading_passage_markdown: 4 bagian -> too_many_passages; label ganda -> duplicate_paragraph_label; soal merujuk teks yang dihapus -> passage_out_of_range', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', [Q.mcq({ question_id: 'Q-S1', passage_no: 2, skill: 'READING' }), Q.mcq({ question_id: 'Q-S2', skill: 'READING' })], { readingPassageMarkdown: 'Satu\n===PASSAGE===\nDua' });
    const four = await setPatchReq(a, set.id, { reading_passage_markdown: 'A\n===PASSAGE===\nB\n===PASSAGE===\nC\n===PASSAGE===\nD' });
    expect(four.status).toBe(400);
    expect(four.json.error.details.map((d: any) => d.code)).toContain('too_many_passages');
    const dup = await setPatchReq(a, set.id, { reading_passage_markdown: '[A] satu\n\n[A] dua\n===PASSAGE===\nB' });
    expect(dup.json.error.details.map((d: any) => d.code)).toContain('duplicate_paragraph_label');
    const gone = await setPatchReq(a, set.id, { reading_passage_markdown: 'Hanya satu bagian' });
    expect(gone.status).toBe(400);
    expect(gone.json.error.details[0]).toMatchObject({ code: 'passage_out_of_range', path: 'questions.Q-S1.passage_no' });
    const nul = await setPatchReq(a, set.id, { reading_passage_markdown: null });
    expect(nul.json.error.details[0].code).toBe('passage_out_of_range');
    const html = await setPatchReq(a, set.id, { reading_passage_markdown: '<script>x</script>\n===PASSAGE===\nB' });
    expect(html.json.error.details.map((d: any) => d.code)).toContain('raw_html_not_allowed');
    expect((await setRow(set.id)).version).toBe(1);
    const ok = await setPatchReq(a, set.id, { reading_passage_markdown: 'Satu baru\n===PASSAGE===\nDua baru\n===PASSAGE===\nTiga' });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    expect(ok.json.data.version).toBe(2);
    // soal merujuk passage_no di luar rentang -> ditolak
    expect((await qPatch(a, set.id, 'Q-S2', { passage_no: 3 })).status).toBe(200);
    expect((await qPatch(a, set.id, 'Q-S2', { passage_no: 4 })).status).toBe(400);
  });
});

// =============================================================================== K3: set berjalan
describe('K3: tidak menyunting set dengan attempt IN_PROGRESS', () => {
  async function liveDrill(over: { questions?: unknown[] } = {}) {
    await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', over.questions ?? mcqs(3));
    const l = await learnerSession();
    await markLearnDone(l.user.id, '1.1.1');
    const s = await call(startRoute, 'POST', '/api/v1/attempts', { cookie: l.cookie, body: { assessment_set_id: set.id } });
    expect(s.status).toBe(201);
    return { set, l, attemptId: s.json.data.id as string, dto: s.json.data };
  }

  it('PATCH set dan PATCH soal -> 409 SET_HAS_ACTIVE_ATTEMPTS tanpa perubahan; sesudah attempt selesai -> 200', async () => {
    const a = await adminSession();
    const { set, l, attemptId, dto } = await liveDrill();
    const before = await setRow(set.id);
    expect((await get(a, setGet, `/api/v1/admin/assessment-sets/${set.id}`, { set_id: set.id })).json.data.has_active_attempts).toBe(true);
    const r1 = await setPatchReq(a, set.id, { title: 'Tidak boleh' });
    expect(r1.status).toBe(409);
    expect(r1.json.error.code).toBe('SET_HAS_ACTIVE_ATTEMPTS');
    const r2 = await qPatch(a, set.id, 'Q-C1', { prompt: 'Tidak boleh juga' });
    expect(r2.status).toBe(409);
    expect(r2.json.error.code).toBe('SET_HAS_ACTIVE_ATTEMPTS');
    expect(await setRow(set.id)).toEqual(before);
    expect(await revisions('ASSESSMENT_SET', set.id)).toHaveLength(0);
    // pelajar tetap dapat menjawab dengan soal yang sama (F-15-07: tidak ada soal yang berubah di tengah jalan)
    const q = dto.questions[0];
    const put = await call(putRoute, 'PUT', `/api/v1/attempts/${attemptId}/answers/${q.question_id}`, { cookie: l.cookie, params: { attempt_id: attemptId, question_id: q.question_id }, body: { response: { option_ids: [q.options[0].option_id] } } });
    expect(put.status).toBe(200);
    await call(submitRoute, 'POST', `/api/v1/attempts/${attemptId}/submit`, { cookie: l.cookie, params: { attempt_id: attemptId } });
    expect((await setPatchReq(a, set.id, { title: 'Boleh sekarang' })).status).toBe(200);
    expect((await qPatch(a, set.id, 'Q-C1', { prompt: 'Boleh juga' })).status).toBe(200);
  });

  it('attempt PRACTICE tanpa aktivitas > 24 jam dan EXAM lewat deadline tidak menghalangi (tidak mengunci set selamanya)', async () => {
    const a = await adminSession();
    setClockForTest(() => T0);
    const { set, l } = await liveDrill();
    // aktivitas terakhir dianggap sudah lama
    setClockForTest(() => T0 + 25 * 3600_000);
    expect((await setPatchReq(a, set.id, { title: 'Attempt basi' })).status).toBe(200);
    setClockForTest(() => T0);
    // EXAM: attempt IN_PROGRESS yang melewati deadline + 5 dtk
    await db.execute(sql`UPDATE attempts SET mode = 'EXAM', deadline_at = ${new Date(T0 - 60_000).toISOString()}::timestamptz WHERE user_id = ${l.user.id}::uuid`);
    expect((await setPatchReq(a, set.id, { title: 'EXAM kedaluwarsa' })).status).toBe(200);
    // EXAM masih berjalan -> menghalangi
    await db.execute(sql`UPDATE attempts SET deadline_at = ${new Date(T0 + 600_000).toISOString()}::timestamptz WHERE user_id = ${l.user.id}::uuid`);
    expect((await setPatchReq(a, set.id, { title: 'EXAM berjalan' })).status).toBe(409);
  });

  it('Placement dan Boss: attempt berjalan pada induk menghalangi penyuntingan set/anak (F-15-07)', async () => {
    const a = await adminSession();
    const l = await learnerSession();
    const [t] = await db.select().from(tiers).where(eq(tiers.tierNumber, 1));
    const [placement] = await db.insert(assessmentSets).values({ assessmentType: 'PLACEMENT_TEST', title: 'Placement', timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED', questionsJson: [Q.mcq({ question_id: 'Q-PL1', difficulty: 2 })] as object[], questionCount: 1 }).returning();
    const [boss] = await db.insert(assessmentSets).values({ assessmentType: 'TIER_BOSS_EXAM', title: 'Boss', tierId: t!.id, timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' }).returning();
    const [kid] = await db.insert(assessmentSets).values({ assessmentType: 'BOSS_SECTION', title: 'Boss L', parentSetId: boss!.id, skillCategory: 'LISTENING', timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED', questionsJson: [Q.mcq({ question_id: 'Q-BL1', skill: 'LISTENING' })] as object[], questionCount: 1 }).returning();
    const live = (setId: string) =>
      db.insert(attempts).values({ userId: l.user.id, assessmentSetId: setId, assessmentVersion: 1, mode: 'EXAM', status: 'IN_PROGRESS', startedAt: new Date(), deadlineAt: new Date(Date.now() + 3600_000), state: {} });
    await live(placement!.id);
    const r = await qPatch(a, placement!.id, 'Q-PL1', { prompt: 'Soal pending akan hilang?' });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('SET_HAS_ACTIVE_ATTEMPTS');
    expect((await status(a, 'assessment-sets', placement!.id, { status: 'DRAFT' })).status).toBe(409);
    await live(boss!.id);
    const k = await qPatch(a, kid!.id, 'Q-BL1', { prompt: 'Anak Boss' });
    expect(k.status).toBe(409);
    expect(k.json.error.code).toBe('SET_HAS_ACTIVE_ATTEMPTS');
    expect((await setPatchReq(a, boss!.id, { title: 'Boss baru' })).status).toBe(409);
    await db.execute(sql`UPDATE attempts SET status = 'GRADED'`);
    expect((await qPatch(a, kid!.id, 'Q-BL1', { prompt: 'Anak Boss' })).status).toBe(200);
  });

  it('dua admin menyunting soal yang sama serentak: keduanya berhasil, versi berurutan (N+1, N+2), revisi tanpa duplikat', async () => {
    const a1 = await adminSession();
    const a2 = await adminSession();
    await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', mcqs(3));
    const [r1, r2] = await Promise.all([qPatch(a1, set.id, 'Q-C1', { prompt: 'Dari admin satu' }), qPatch(a2, set.id, 'Q-C1', { prompt: 'Dari admin dua' })]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect([r1.json.data.set.version, r2.json.data.set.version].sort()).toEqual([2, 3]);
    const row = await setRow(set.id);
    expect(row.version).toBe(3);
    expect(['Dari admin satu', 'Dari admin dua']).toContain(row.questions_json[0].prompt);
    expect((await revisions('ASSESSMENT_SET', set.id)).map((x) => x.version)).toEqual([1, 2]);
  });
});

// =============================================================================== daftar, detail, kurikulum
describe('GET daftar dan detail', () => {
  it('GET /admin/assessment-sets: filter jenis/status/tier/q (literal), urutan updated_at DESC, paginasi, validasi', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    await seedMaterial('2.1.1');
    const s1 = await addDrill('1.1.1', mcqs(2), { title: 'Latihan 100% pasti', status: 'DRAFT' });
    const s2 = await addDrill('2.1.1', mcqs(3), { title: 'Latihan Tier Dua' });
    await db.execute(sql`UPDATE assessment_sets SET updated_at = ${new Date(T0).toISOString()}::timestamptz WHERE id = ${s1.id}::uuid`);
    await db.execute(sql`UPDATE assessment_sets SET updated_at = ${new Date(T0 + 1000).toISOString()}::timestamptz WHERE id = ${s2.id}::uuid`);
    const list = (q = '') => get(a, setsList, `/api/v1/admin/assessment-sets${q}`);
    const all = await list();
    expect(all.status).toBe(200);
    expect(SetListResponseSchema.safeParse(all.json).success).toBe(true);
    expect(all.json.data.map((x: any) => x.id)).toEqual([s2.id, s1.id]);
    expect(all.json.meta).toEqual({ page: 1, page_size: 20, total: 2 });
    expect(all.json.data[1]).toMatchObject({ assessment_type: 'ACTIVE_DRILL', title: 'Latihan 100% pasti', status: 'DRAFT', question_count: 2, version: 1, origin: 'ORIGINAL_AUTHORED', scope_label: 'Sub-modul 1.1.1' });
    expect((await list('?status=DRAFT')).json.data.map((x: any) => x.id)).toEqual([s1.id]);
    expect((await list('?tier_number=2')).json.data.map((x: any) => x.id)).toEqual([s2.id]);
    expect((await list('?assessment_type=SKIP_MODULE_TEST')).json.data).toHaveLength(0);
    expect((await list('?q=100%25')).json.data.map((x: any) => x.id)).toEqual([s1.id]); // % literal
    expect((await list('?q=%25')).json.data.map((x: any) => x.id)).toEqual([s1.id]); // bukan wildcard
    expect((await list('?q=_')).json.data).toHaveLength(0);
    expect((await list('?q=tier%20dua')).json.data.map((x: any) => x.id)).toEqual([s2.id]); // ILIKE
    expect((await list('?page=2&page_size=1')).json.data.map((x: any) => x.id)).toEqual([s1.id]);
    for (const bad of ['?tier_number=5', '?status=FOO', '?assessment_type=FOO', '?page_size=101', '?q=', '?bogus=1']) expect((await list(bad)).status, bad).toBe(400);
  });

  it('GET /admin/assessment-sets/{id}: detail dengan kunci jawaban, blockers, reading, reviewed_at; 404 bila tidak ada', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', mcqs(2), { readingPassageMarkdown: 'Teks', attributionText: 'Atribusi' });
    const r = await get(a, setGet, `/api/v1/admin/assessment-sets/${set.id}`, { set_id: set.id });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(SetDetailResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data).toMatchObject({ id: set.id, title: 'Latihan 1.1.1', status: 'PUBLISHED', time_limit_seconds: 300, pass_percent: null, reading_passage_markdown: 'Teks', attribution_text: 'Atribusi', reviewed_at: null, has_active_attempts: false, blockers: [] });
    expect(r.json.data.questions[0]).toMatchObject({ question_id: 'Q-C1', correct_answers: ['right-1'], explanation_id: 'Pembahasan 1' });
    expect((await get(a, setGet, '/api/v1/admin/assessment-sets/7a1b2c3d-0000-4000-8000-000000000000', { set_id: '7a1b2c3d-0000-4000-8000-000000000000' })).status).toBe(404);
  });

  it('GET /admin/curriculum: 4 Tier/13 modul/31 sub-modul, referensi set, section_skills, penghalang', async () => {
    const a = await adminSession();
    const { slideAssets } = await seedMaterial('1.1.1', { slides: 1 });
    await db.execute(sql`UPDATE content_assets SET rights_status = 'UNVERIFIED' WHERE id = ${slideAssets[0]!}::uuid`);
    await draftDrill('1.1.1', mcqs(4)); // drill DRAFT -> penghalang DRILL_NOT_PUBLISHED
    await seedMaterial('1.1.2');
    await addDrill('1.1.2', mcqs(2));
    const [t1] = await db.select().from(tiers).where(eq(tiers.tierNumber, 1));
    const [boss] = await db.insert(assessmentSets).values({ assessmentType: 'TIER_BOSS_EXAM', title: 'Boss', tierId: t1!.id, timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'DRAFT' }).returning();
    await db.insert(assessmentSets).values([
      { assessmentType: 'BOSS_SECTION', title: 'L', parentSetId: boss!.id, skillCategory: 'LISTENING', timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'DRAFT' },
      { assessmentType: 'BOSS_SECTION', title: 'R', parentSetId: boss!.id, skillCategory: 'READING', timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'DRAFT' },
    ]);
    await db.insert(assessmentSets).values({ assessmentType: 'PLACEMENT_TEST', title: 'Placement', timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'DRAFT', questionCount: 0 });
    const r = await get(a, curriculumRoute, '/api/v1/admin/curriculum');
    expect(r.status).toBe(200);
    expect(CurriculumResponseSchema.safeParse(r.json).success).toBe(true);
    const d = r.json.data;
    expect(d.tiers.map((t: any) => t.tier_number)).toEqual([1, 2, 3, 4]);
    expect(d.tiers.reduce((n: number, t: any) => n + t.modules.length, 0)).toBe(13);
    const subs = d.tiers.flatMap((t: any) => t.modules.flatMap((m: any) => m.sub_modules));
    expect(subs).toHaveLength(31);
    const s111 = subs.find((s: any) => s.sub_module_code === '1.1.1');
    expect(s111).toMatchObject({ has_material: true, origin: 'ORIGINAL_AUTHORED', blocker_count: 2, drill: { status: 'DRAFT', question_count: 4, version: 1 } }); // aset UNVERIFIED + drill tidak PUBLISHED
    const s112 = subs.find((s: any) => s.sub_module_code === '1.1.2');
    expect(s112).toMatchObject({ blocker_count: 0, drill: { status: 'PUBLISHED' } });
    expect(subs.find((s: any) => s.sub_module_code === '1.1.3')).toMatchObject({ has_material: false, origin: null, drill: null, blocker_count: 2 }); // MATERIAL_MISSING + DRILL_NOT_PUBLISHED
    expect(d.tiers[0].boss).toMatchObject({ id: boss!.id, status: 'DRAFT', section_skills: ['LISTENING', 'READING'] });
    expect(d.tiers[1].boss).toBeNull();
    expect(d.tiers[0].boss.origin).toBe('ORIGINAL_AUTHORED');
    expect(s112.drill.origin).toBe('ORIGINAL_AUTHORED');
    expect(d.tiers[0].skip_set).toBeNull();
    expect(d.placement).toMatchObject({ status: 'DRAFT', question_count: 0, version: 1 });
    // blocker_count konsisten dengan detail sub-modul
    const sid = await subId('1.1.1');
    const detail = await get(a, subGet, `/api/v1/admin/sub-modules/${sid}`, { sub_module_id: sid });
    expect(detail.json.data.blockers).toHaveLength(s111.blocker_count);
  });

  it('GET /admin/sub-modules/{id}: detail materi dengan rights_status, mini_task, drill, penghalang; 404', async () => {
    const a = await adminSession();
    const { slideAssets } = await seedMaterial('1.1.1', { slides: 1, videoIds: ['dQw4w9WgXcQ'], miniTask: 'SELF_CHECK', attribution: 'Atribusi materi' });
    await db.execute(sql`UPDATE content_assets SET rights_status = 'UNVERIFIED' WHERE id = ${slideAssets[0]!}::uuid`);
    await addDrill('1.1.1', mcqs(2));
    const sid = await subId('1.1.1');
    const r = await get(a, subGet, `/api/v1/admin/sub-modules/${sid}`, { sub_module_id: sid });
    expect(r.status).toBe(200);
    expect(SubModuleDetailResponseSchema.safeParse(r.json).success).toBe(true);
    const d = r.json.data;
    expect(d.sub_module).toMatchObject({ id: sid, sub_module_code: '1.1.1', status: 'PUBLISHED', passing_score_percent: 75, content_version: 1, module: { module_code: '1.1' } });
    expect(d.material).toMatchObject({ origin: 'ORIGINAL_AUTHORED', attribution_text: 'Atribusi materi', content_version: 1 });
    expect(d.material.article_markdown).toContain('artikel');
    expect(d.material.videos[0]).toMatchObject({ video_id: 'dQw4w9WgXcQ', rights_status: 'EMBED_ONLY', start_sec: 95, end_sec: 420 });
    expect(d.material.slides[0]).toMatchObject({ order: 1, rights_status: 'UNVERIFIED' });
    expect(d.material.mini_task).toMatchObject({ task_type: 'SELF_CHECK', ai_rubric_criteria: expect.stringContaining('RAHASIA') });
    expect(d.drill).toMatchObject({ status: 'PUBLISHED', question_count: 2, version: 1 });
    expect(d.blockers).toEqual([expect.objectContaining({ code: 'ASSET_UNVERIFIED', entity_type: 'SUB_MODULE', entity_id: sid, asset_id: slideAssets[0] })]);
    expect((await get(a, subGet, '/api/v1/admin/sub-modules/7a1b2c3d-0000-4000-8000-000000000000', { sub_module_id: '7a1b2c3d-0000-4000-8000-000000000000' })).status).toBe(404);
    const none = await subId('1.1.3');
    expect((await get(a, subGet, `/api/v1/admin/sub-modules/${none}`, { sub_module_id: none })).json.data).toMatchObject({ material: null, drill: null, blockers: [expect.objectContaining({ code: 'MATERIAL_MISSING' }), expect.objectContaining({ code: 'DRILL_NOT_PUBLISHED' })] });
  });
});

// =============================================================================== kualitas soal (K5)
describe('GET /admin/assessment-sets/{id}/quality', () => {
  async function seedAnswers(setId: string, qid: string, correct: number, total: number, over: { status?: string } = {}) {
    for (let i = 0; i < total; i++) {
      const l = await learnerSession();
      const [att] = await db
        .insert(attempts)
        .values({ userId: l.user.id, assessmentSetId: setId, assessmentVersion: 1, mode: 'PRACTICE', status: (over.status ?? 'GRADED') as 'GRADED', startedAt: new Date(T0), state: {} })
        .returning();
      await db.execute(sql`INSERT INTO attempt_answers (attempt_id, assessment_set_id, question_id, question_type, skill, response, is_correct, score, answered_at)
        VALUES (${att!.id}::uuid, ${setId}::uuid, ${qid}, 'MCQ_SINGLE', 'GRAMMAR', '{}'::jsonb, ${i < correct}, ${i < correct ? '1.00' : '0.00'}, now())`);
    }
  }

  it('46 jawaban dengan 8 benar -> 0,17 TOO_HARD; 19 jawaban tidak pernah ber-flag; 20 jawaban 4 benar (0,20) tidak ber-flag; 3 benar -> TOO_HARD; semua benar -> TOO_EASY', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', mcqs(6));
    await seedAnswers(set.id, 'Q-C1', 8, 46);
    await seedAnswers(set.id, 'Q-C2', 7, 19); // < 20 jawaban
    await seedAnswers(set.id, 'Q-C3', 4, 20); // 0,20: bukan < 0,20
    await seedAnswers(set.id, 'Q-C4', 3, 20); // 0,15
    await seedAnswers(set.id, 'Q-C5', 20, 20); // 1,00 > 0,98
    await seedAnswers(set.id, 'Q-C6', 5, 12, { status: 'IN_PROGRESS' }); // tidak dihitung
    // IN_PROGRESS pada pengguna berbeda -> tidak melanggar indeks unik aktif
    const r = await get(a, qualityGet, `/api/v1/admin/assessment-sets/${set.id}/quality`, { set_id: set.id });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(QualityResponseSchema.safeParse(r.json).success).toBe(true);
    const by = Object.fromEntries(r.json.data.questions.map((q: any) => [q.question_id, q]));
    expect(by['Q-C1']).toEqual({ question_id: 'Q-C1', attempts_count: 46, correct_rate: 0.17, flag: 'TOO_HARD' });
    expect(by['Q-C2']).toEqual({ question_id: 'Q-C2', attempts_count: 19, correct_rate: 0.37, flag: null });
    expect(by['Q-C3']).toMatchObject({ attempts_count: 20, correct_rate: 0.2, flag: null });
    expect(by['Q-C4']).toMatchObject({ correct_rate: 0.15, flag: 'TOO_HARD' });
    expect(by['Q-C5']).toMatchObject({ correct_rate: 1, flag: 'TOO_EASY' });
    expect(by['Q-C6']).toEqual({ question_id: 'Q-C6', attempts_count: 0, correct_rate: 0, flag: null });
    expect(r.json.data.questions.map((q: any) => q.question_id)).toEqual(['Q-C1', 'Q-C2', 'Q-C3', 'Q-C4', 'Q-C5', 'Q-C6']);
    expect((await get(a, qualityGet, '/api/v1/admin/assessment-sets/7a1b2c3d-0000-4000-8000-000000000000/quality', { set_id: '7a1b2c3d-0000-4000-8000-000000000000' })).status).toBe(404);
  });
});

// =============================================================================== revisi
describe('GET /admin/content-revisions', () => {
  it('daftar urut version DESC, detail memuat snapshot SEBELUM perubahan; entity_type salah -> 400; id tak ada -> 404', async () => {
    const a = await adminSession();
    await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', mcqs(2));
    for (const t of ['Judul 2', 'Judul 3', 'Judul 4']) expect((await setPatchReq(a, set.id, { title: t })).status).toBe(200);
    const list = await get(a, revisionsList, `/api/v1/admin/content-revisions?entity_type=ASSESSMENT_SET&entity_id=${set.id}`);
    expect(list.status).toBe(200);
    expect(RevisionListResponseSchema.safeParse(list.json).success).toBe(true);
    expect(list.json.data.map((x: any) => x.version)).toEqual([3, 2, 1]);
    expect(list.json.data[0]).toMatchObject({ entity_type: 'ASSESSMENT_SET', entity_id: set.id, changed_by_name: 'Uji Coba', import_batch_id: null });
    expect(list.json.meta).toEqual({ page: 1, page_size: 20, total: 3 });
    expect(JSON.stringify(list.json)).not.toContain('snapshot');
    const d = await get(a, revisionGet, `/api/v1/admin/content-revisions/${list.json.data[2].id}`, { revision_id: list.json.data[2].id });
    expect(d.status).toBe(200);
    expect(RevisionDetailResponseSchema.safeParse(d.json).success).toBe(true);
    expect(d.json.data.version).toBe(1);
    expect(d.json.data.snapshot).toMatchObject({ title: 'Latihan 1.1.1', version: 1 });
    expect((await get(a, revisionGet, `/api/v1/admin/content-revisions/${list.json.data[0].id}`, { revision_id: list.json.data[0].id })).json.data.snapshot.title).toBe('Judul 3');
    const p2 = await get(a, revisionsList, `/api/v1/admin/content-revisions?entity_type=ASSESSMENT_SET&entity_id=${set.id}&page=2&page_size=2`);
    expect(p2.json.data.map((x: any) => x.version)).toEqual([1]);
    for (const bad of ['?entity_type=FOO&entity_id=' + set.id, '?entity_type=ASSESSMENT_SET', '?entity_id=' + set.id, '?entity_type=MODULE&entity_id=' + set.id, '?entity_type=ASSESSMENT_SET&entity_id=bukan-uuid', `?entity_type=ASSESSMENT_SET&entity_id=${set.id}&page_size=101`]) {
      const r = await get(a, revisionsList, `/api/v1/admin/content-revisions${bad}`);
      expect(r.status, bad).toBe(400);
      expect(r.json.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await get(a, revisionGet, '/api/v1/admin/content-revisions/7a1b2c3d-0000-4000-8000-000000000000', { revision_id: '7a1b2c3d-0000-4000-8000-000000000000' })).status).toBe(404);
  });
});

