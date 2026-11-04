/**
 * Perbaikan QA W8 (TASK-016/017/020): F-20-01 (K3 modul/sub-modul + gatekeeping toleran), F-20-02 (attempt PRACTICE basi / beda versi),
 * F-20-04 (satu definisi attempt hidup). Route handler nyata + Postgres.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { assessmentSets, attempts, tiers } from '@/db/schema';
import { setClockForTest } from '@/server/clock';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { activeAttemptSetIds, hasActiveAttempts } from '@/server/content/active-attempts';
import { applyDrillResult, applySkipResult } from '@/server/gatekeeping/service';
import { POST as statusPost } from '@/app/api/v1/admin/[entity]/[id]/status/route';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { GET as getRoute } from '@/app/api/v1/attempts/[attempt_id]/route';
import { PUT as putRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as submitRoute } from '@/app/api/v1/attempts/[attempt_id]/submit/route';
import { call, adminSession, learnerSession } from './helpers';
import { addDrill, markLearnDone, resetLearning, seedMaterial, subId } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = getDb();
const T0 = Date.parse('2026-11-03T03:00:00.000Z');
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as any[];

const mcqs = (n: number) =>
  Array.from({ length: n }, (_, i) => Q.mcq({ question_id: `Q-W${i + 1}`, prompt: `P${i + 1}`, options: [`right-${i + 1}`, 'x', 'y', 'z'], correct_answers: [`right-${i + 1}`], explanation_id: `Pembahasan ${i + 1}` }));
const optionFor = (q: any, text: string) => q.options.find((o: any) => o.text === text).option_id as string;

const status = (cookie: string | null, entity: string, id: string, body: unknown) =>
  call(statusPost, 'POST', `/api/v1/admin/${entity}/${id}/status`, { cookie, params: { entity, id }, body });
const startAttempt = (cookie: string | null, setId: string) => call(startRoute, 'POST', '/api/v1/attempts', { cookie, body: { assessment_set_id: setId } });
/** Jawab benar (`right-N` sesuai prompt `PN`) atau salah ('x'); urutan soal diacak server, jadi pilih berdasarkan prompt. */
const putAnswer = (cookie: string | null, attemptId: string, q: any, mode: 'right' | 'wrong' = 'right') =>
  call(putRoute, 'PUT', `/api/v1/attempts/${attemptId}/answers/${q.question_id}`, {
    cookie,
    params: { attempt_id: attemptId, question_id: q.question_id },
    body: { response: { option_ids: [optionFor(q, mode === 'right' ? `right-${q.prompt.slice(1)}` : 'x')] } },
  });
const submit = (cookie: string | null, id: string) => call(submitRoute, 'POST', `/api/v1/attempts/${id}/submit`, { cookie, params: { attempt_id: id } });
const getAttempt = (cookie: string | null, id: string) => call(getRoute, 'GET', `/api/v1/attempts/${id}`, { cookie, params: { attempt_id: id } });
const attemptStatus = async (id: string) => (await rows(sql`SELECT status FROM attempts WHERE id = ${id}::uuid`))[0].status as string;

async function liveDrill() {
  await seedMaterial('1.1.1');
  const set = await addDrill('1.1.1', mcqs(3));
  const l = await learnerSession();
  await markLearnDone(l.user.id, '1.1.1');
  const s = await startAttempt(l.cookie, set.id);
  expect(s.status, JSON.stringify(s.json)).toBe(201);
  return { set, l, dto: s.json.data, attemptId: s.json.data.id as string };
}

beforeEach(async () => {
  resetRateLimits();
  await resetLearning();
  setClockForTest(null);
});
afterEach(() => setClockForTest(null));
afterAll(async () => {
  await resetLearning();
  await db.execute(sql`DELETE FROM content_assets`);
  await closeDb();
});

// =============================================================================== F-20-01
describe('F-20-01: arsip modul/sub-modul saat pelajar mengerjakan Drill', () => {
  it('K3: sub-modul dan modul PUBLISHED tidak dapat diarsipkan/didraf saat Drill berjalan (409), dan boleh setelah submit', async () => {
    const a = await adminSession();
    const { l, attemptId } = await liveDrill();
    await db.execute(sql`UPDATE sub_modules SET status = 'PUBLISHED' WHERE sub_module_code = '1.1.1'`);
    await db.execute(sql`UPDATE modules SET status = 'PUBLISHED' WHERE id = (SELECT module_id FROM sub_modules WHERE sub_module_code = '1.1.1')`);
    const sid = await subId('1.1.1');
    const [{ module_id: mid }] = await rows(sql`SELECT module_id FROM sub_modules WHERE id = ${sid}::uuid`);
    for (const to of ['ARCHIVED', 'DRAFT']) {
      const r = await status(a.cookie, 'sub-modules', sid, { status: to });
      expect(r.status, to).toBe(409);
      expect(r.json.error.code).toBe('SET_HAS_ACTIVE_ATTEMPTS');
      const m = await status(a.cookie, 'modules', mid, { status: to });
      expect(m.status, `modul ${to}`).toBe(409);
      expect(m.json.error.code).toBe('SET_HAS_ACTIVE_ATTEMPTS');
    }
    expect((await rows(sql`SELECT status FROM sub_modules WHERE id = ${sid}::uuid`))[0].status).toBe('PUBLISHED');
    expect((await submit(l.cookie, attemptId)).status).toBe(200);
    expect((await status(a.cookie, 'sub-modules', sid, { status: 'ARCHIVED' })).status).toBe(200);
  });

  it('mulai Drill -> sub-modul diarsipkan (melewati K3 lewat DB) -> submit: 200, skor tersimpan, tanpa 500', async () => {
    const { l, dto, attemptId } = await liveDrill();
    expect((await putAnswer(l.cookie, attemptId, dto.questions[0])).status).toBe(200);
    expect((await putAnswer(l.cookie, attemptId, dto.questions[1])).status).toBe(200);
    await db.execute(sql`UPDATE sub_modules SET status = 'ARCHIVED' WHERE sub_module_code = '1.1.1'`);
    const res = await submit(l.cookie, attemptId);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json.data.attempt).toMatchObject({ status: 'GRADED' });
    expect(Number(res.json.data.attempt.score_percent)).toBeCloseTo(66.67, 1);
    expect(await attemptStatus(attemptId)).toBe('GRADED');
    expect(res.json.data.progress).toBeNull();
    // submit ulang idempoten
    expect((await submit(l.cookie, attemptId)).status).toBe(200);
  });

  it('applyDrillResult / applySkipResult atas entitas yang tidak ada: no-op tanpa galat (unlocked kosong)', async () => {
    const l = await learnerSession();
    const ghost = '00000000-0000-4000-8000-0000000000aa';
    const d = await db.transaction((tx) => applyDrillResult(tx, l.user.id, { subModuleId: ghost, scorePercent: 90 }));
    expect(Array.isArray(d.unlocked)).toBe(true); // hanya pembukaan awal pengguna baru; tanpa galat
    const s = await db.transaction((tx) => applySkipResult(tx, l.user.id, { scope: 'MODULE', targetId: ghost, scorePercent: 95, passed: true }));
    expect(Array.isArray(s.unlocked)).toBe(true);
  });

  it('kesalahan pemrograman gatekeeping dilempar sebagai ApiError (bukan Error biasa)', async () => {
    const l = await learnerSession();
    await expect(db.transaction((tx) => applyDrillResult(tx, l.user.id, { subModuleId: '00000000-0000-4000-8000-0000000000aa', scorePercent: 150 }))).rejects.toMatchObject({ name: 'ApiError', code: 'INTERNAL_ERROR' });
    await expect(db.transaction((tx) => applySkipResult(tx, l.user.id, { scope: 'TIER', targetId: '00000000-0000-4000-8000-0000000000bb', scorePercent: 90, passed: true }))).rejects.toMatchObject({ name: 'ApiError' });
  });
});

// =============================================================================== F-20-02
describe('F-20-02: attempt PRACTICE basi atau beda versi tidak dapat dilanjutkan', () => {
  it('> 24 jam tanpa aktivitas: PUT answers, submit, dan GET -> 409 ATTEMPT_NOT_ACTIVE; status ABANDONED; tidak ada jawaban/hasil tersimpan', async () => {
    setClockForTest(() => T0);
    for (const op of ['put', 'submit', 'get'] as const) {
      await resetLearning();
      const { l, dto, attemptId } = await liveDrill();
      setClockForTest(() => T0 + 25 * 3600_000);
      const r = op === 'put' ? await putAnswer(l.cookie, attemptId, dto.questions[0]) : op === 'submit' ? await submit(l.cookie, attemptId) : await getAttempt(l.cookie, attemptId);
      expect(r.status, op).toBe(409);
      expect(r.json.error.code, op).toBe('ATTEMPT_NOT_ACTIVE');
      expect(await attemptStatus(attemptId), op).toBe('ABANDONED');
      expect(await rows(sql`SELECT 1 FROM attempt_answers WHERE attempt_id = ${attemptId}::uuid`), op).toHaveLength(0);
      setClockForTest(() => T0);
    }
  });

  it('tepat di bawah 24 jam masih aktif', async () => {
    setClockForTest(() => T0);
    const { l, dto, attemptId } = await liveDrill();
    setClockForTest(() => T0 + 23 * 3600_000);
    expect((await putAnswer(l.cookie, attemptId, dto.questions[0])).status).toBe(200);
    expect(await attemptStatus(attemptId)).toBe('IN_PROGRESS');
  });

  it('versi set berubah setelah attempt dimulai (melewati K3 lewat DB): PUT/submit/GET ditolak dan attempt ABANDONED; mulai ulang memakai konten baru', async () => {
    const { set, l, dto, attemptId } = await liveDrill();
    await db.execute(sql`UPDATE assessment_sets SET version = version + 1 WHERE id = ${set.id}::uuid`);
    const put = await putAnswer(l.cookie, attemptId, dto.questions[0]);
    expect(put.status).toBe(409);
    expect(put.json.error.code).toBe('ATTEMPT_NOT_ACTIVE');
    expect(await attemptStatus(attemptId)).toBe('ABANDONED');
    expect((await submit(l.cookie, attemptId)).json.error.code).toBe('ATTEMPT_NOT_ACTIVE');
    const fresh = await startAttempt(l.cookie, set.id);
    expect(fresh.status).toBe(201);
    expect(fresh.json.data.id).not.toBe(attemptId);
    expect((await rows(sql`SELECT assessment_version AS v FROM attempts WHERE id = ${fresh.json.data.id}::uuid`))[0].v).toBe(2);
  });

  it('POST /attempts pada attempt beda versi: yang lama ABANDONED dan attempt baru dibuat (bukan resume)', async () => {
    const { set, l, attemptId } = await liveDrill();
    await db.execute(sql`UPDATE assessment_sets SET version = 5 WHERE id = ${set.id}::uuid`);
    const again = await startAttempt(l.cookie, set.id);
    expect(again.status).toBe(201);
    expect(again.json.data.id).not.toBe(attemptId);
    expect(await attemptStatus(attemptId)).toBe('ABANDONED');
  });
});

// =============================================================================== F-20-04
describe('F-20-04: satu definisi attempt hidup (kurasi dan impor)', () => {
  it('activeAttemptSetIds: induk/anak Boss, PRACTICE basi tidak dihitung, EXAM lewat deadline tidak dihitung', async () => {
    const l = await learnerSession();
    const [t] = await db.select().from(tiers).where(eq(tiers.tierNumber, 1));
    const [boss] = await db.insert(assessmentSets).values({ assessmentType: 'TIER_BOSS_EXAM', title: 'Boss', tierId: t!.id, timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' }).returning();
    const [kid] = await db.insert(assessmentSets).values({ assessmentType: 'BOSS_SECTION', title: 'Boss L', parentSetId: boss!.id, skillCategory: 'LISTENING', timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED', questionsJson: [Q.mcq({ question_id: 'Q-BL1', skill: 'LISTENING' })] as object[], questionCount: 1 }).returning();
    const [kid2] = await db.insert(assessmentSets).values({ assessmentType: 'BOSS_SECTION', title: 'Boss R', parentSetId: boss!.id, skillCategory: 'READING', timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED', questionsJson: [Q.mcq({ question_id: 'Q-BR1', skill: 'READING' })] as object[], questionCount: 1 }).returning();
    const now = new Date(T0);
    const live = (over: Partial<typeof attempts.$inferInsert> = {}) =>
      db.insert(attempts).values({ userId: l.user.id, assessmentSetId: boss!.id, assessmentVersion: 1, mode: 'EXAM', status: 'IN_PROGRESS', startedAt: now, deadlineAt: new Date(T0 + 3600_000), state: {}, updatedAt: now, ...over }).returning();
    expect(await hasActiveAttempts(db, kid!.id, now)).toBe(false);
    const [a] = await live();
    // attempt Boss pada set INDUK menghalangi section (anak) dan induk itu sendiri
    expect(await hasActiveAttempts(db, kid!.id, now)).toBe(true);
    expect(await hasActiveAttempts(db, kid2!.id, now)).toBe(true);
    expect(await hasActiveAttempts(db, boss!.id, now)).toBe(true);
    expect([...(await activeAttemptSetIds(db, [kid!.id, boss!.id, '00000000-0000-4000-8000-0000000000cc'], now))].sort()).toEqual([boss!.id, kid!.id].sort());
    // EXAM lewat deadline + 5 dtk tidak dihitung
    await db.update(attempts).set({ deadlineAt: new Date(T0 - 60_000) }).where(eq(attempts.id, a!.id));
    expect(await hasActiveAttempts(db, kid!.id, now)).toBe(false);
    // PRACTICE basi tidak dihitung, segar dihitung
    await db.update(attempts).set({ mode: 'PRACTICE', deadlineAt: null, updatedAt: new Date(T0 - 25 * 3600_000) }).where(eq(attempts.id, a!.id));
    expect(await hasActiveAttempts(db, boss!.id, now)).toBe(false);
    await db.update(attempts).set({ updatedAt: new Date(T0 - 3600_000) }).where(eq(attempts.id, a!.id));
    expect(await hasActiveAttempts(db, boss!.id, now)).toBe(true);
  });
});
