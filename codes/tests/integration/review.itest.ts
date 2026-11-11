/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { ReviewSummaryResponseSchema } from '@/contracts/review';
import { closeDb, execute, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { runImport } from '@/server/content/import-service';
import { POST as mixRoute } from '@/app/api/v1/mix-sessions/route';
import { GET as reviewsRoute } from '@/app/api/v1/me/reviews/route';
import { GET as getRoute } from '@/app/api/v1/attempts/[attempt_id]/route';
import { PUT as putRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as submitRoute } from '@/app/api/v1/attempts/[attempt_id]/submit/route';
import { call, learnerSession } from './helpers';

const db = getDb();
type L = Awaited<ReturnType<typeof learnerSession>>;

const mix = (u: L, body: unknown) => call(mixRoute, 'POST', '/api/v1/mix-sessions', { cookie: u.cookie, body });
const reviews = (u: L) => call(reviewsRoute, 'GET', '/api/v1/me/reviews', { cookie: u.cookie });
const getAttempt = (u: L, id: string) => call(getRoute, 'GET', `/api/v1/attempts/${id}`, { cookie: u.cookie, params: { attempt_id: id } });
const put = (u: L, id: string, qid: string, response: unknown) =>
  call(putRoute, 'PUT', `/api/v1/attempts/${id}/answers/${qid}`, { cookie: u.cookie, params: { attempt_id: id, question_id: qid }, body: { response } });
const submit = (u: L, id: string) => call(submitRoute, 'POST', `/api/v1/attempts/${id}/submit`, { cookie: u.cookie, params: { attempt_id: id } });
const rows = async (q: ReturnType<typeof sql>) => (await execute(db, q)).rows as any[];
const DAY = 24 * 3600 * 1000;

/** Jawab satu soal tersaji, benar atau salah, memakai kunci dari snapshot state. */
async function answer(u: L, attemptId: string, dto: any, qid: string, right: boolean) {
  const pub = dto.questions.find((q: any) => q.question_id === qid);
  const st = (await rows(sql`SELECT state FROM attempts WHERE id = ${attemptId}`))[0].state;
  const full = (typeof st === 'string' ? JSON.parse(st) : st).questions.find((q: any) => q.question_id === qid).question;
  if (pub.options) {
    const want = right ? full.correct_answers : full.options.filter((o: string) => !full.correct_answers.includes(o)).slice(0, full.correct_answers.length);
    const ids = want.map((t: string) => pub.options.find((o: any) => o.text === t).option_id);
    return put(u, attemptId, qid, { option_ids: ids });
  }
  if (pub.question_type === 'FILL_IN_BLANK') return put(u, attemptId, qid, { text: right ? full.correct_answers[0] : 'zzz' });
  throw new Error(`tipe belum didukung helper: ${pub.question_type}`);
}

/** Buat sesi, jawab (salah bila `wrong` benar, sisanya benar), submit. Mengembalikan id soal tersaji. */
async function play(u: L, body: unknown, wrong: (qid: string, i: number) => boolean) {
  const s = await mix(u, body);
  expect(s.status, JSON.stringify(s.json)).toBe(201);
  const attemptId = s.json.data.attempt_id;
  const dto = (await getAttempt(u, attemptId)).json.data;
  const ids: string[] = dto.questions.map((q: any) => q.question_id);
  for (const [i, qid] of ids.entries()) {
    const r = await answer(u, attemptId, dto, qid, !wrong(qid, i));
    expect(r.status, JSON.stringify(r.json)).toBe(200);
  }
  const sub = await submit(u, attemptId);
  expect(sub.status, JSON.stringify(sub.json)).toBe(200);
  return ids;
}

const reviewOf = async (userId: string, qid: string) =>
  (await rows(sql`SELECT box, due_at, lapses, mastered_at FROM question_reviews WHERE user_id = ${userId} AND question_id = ${qid}`))[0];

beforeAll(async () => {
  const assets = await runImport(db, { dir: path.resolve('content', 'gt-listening'), publish: true, dryRun: false, actorUserId: null });
  expect(assets.exitCode, assets.lines.join('\n')).toBe(0);
  const out = await runImport(db, { dir: path.resolve('content', 'gt-bank'), publish: true, dryRun: false, actorUserId: null });
  expect(out.exitCode, out.lines.join('\n')).toBe(0);
});
afterAll(async () => {
  await execute(db, sql`DELETE FROM attempts`);
  await execute(db, sql`DELETE FROM question_reviews`);
  await execute(db, sql`DELETE FROM assessment_sets WHERE assessment_type = 'QUESTION_BANK'`);
  await closeDb();
});
beforeEach(async () => {
  resetRateLimits();
  await execute(db, sql`DELETE FROM attempts`);
  await execute(db, sql`DELETE FROM question_reviews`);
});

const MANUAL = { skills: ['GRAMMAR', 'VOCAB'], question_types: ['MCQ_SINGLE', 'FILL_IN_BLANK'], count: 5, mode: 'MANUAL', seed: 'rv1' };

describe('pengulangan berjarak (SPEC-026)', () => {
  it('salah -> terjadwal +1 hari; benar tidak terjadwal; ringkasan menghitung terjadwal dan jatuh tempo berikutnya', async () => {
    const u = await learnerSession();
    const before = Date.now();
    const ids = await play(u, MANUAL, (_q, i) => i === 0);
    const r = await reviewOf(u.user.id, ids[0]!);
    expect(r).toMatchObject({ box: 1, lapses: 1, mastered_at: null });
    expect(Number(r.due_at)).toBeGreaterThanOrEqual(before + DAY - 1000);
    for (const qid of ids.slice(1)) expect(await reviewOf(u.user.id, qid)).toBeUndefined();

    const s = await reviews(u);
    expect(ReviewSummaryResponseSchema.safeParse(s.json).success).toBe(true);
    expect(s.json.data).toMatchObject({ due_count: 0, scheduled_count: 1, mastered_count: 0 });
    expect(s.json.data.next_due_at).not.toBeNull();
  });

  it('REVIEW_DUE tanpa soal jatuh tempo -> 422 max_available:0', async () => {
    const u = await learnerSession();
    const r = await mix(u, { count: 20, mode: 'REVIEW_DUE' });
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe('MIX_NOT_ENOUGH_QUESTIONS');
    expect(r.json.error.details[0].code).toBe('max_available:0');
  });

  it('soal jatuh tempo masuk sesi REVIEW_DUE; benar naik ke kotak 2 (+3 hari); salah lagi kembali ke kotak 1', async () => {
    const u = await learnerSession();
    const ids = await play(u, MANUAL, (_q, i) => i < 2);
    const [q1, q2] = ids as [string, string];
    await execute(db, sql`UPDATE question_reviews SET due_at = ${Date.now() - 1000} WHERE user_id = ${u.user.id}`);
    expect((await reviews(u)).json.data.due_count).toBe(2);

    const before = Date.now();
    const served = await play(u, { count: 20, mode: 'REVIEW_DUE' }, (qid) => qid === q2);
    expect(new Set(served)).toEqual(new Set([q1, q2]));

    const r1 = await reviewOf(u.user.id, q1);
    expect(r1).toMatchObject({ box: 2, lapses: 1 });
    expect(Number(r1.due_at)).toBeGreaterThanOrEqual(before + 3 * DAY - 1000);
    expect(await reviewOf(u.user.id, q2)).toMatchObject({ box: 1, lapses: 2 });
    expect((await reviews(u)).json.data).toMatchObject({ due_count: 0, scheduled_count: 2 });
  });

  it('jawaban benar sebelum jatuh tempo tidak mengubah jadwal', async () => {
    const u = await learnerSession();
    const ids = await play(u, MANUAL, (_q, i) => i === 0);
    const before = await reviewOf(u.user.id, ids[0]!);
    await play(u, MANUAL, () => false);
    expect(await reviewOf(u.user.id, ids[0]!)).toEqual(before);
  });
});
