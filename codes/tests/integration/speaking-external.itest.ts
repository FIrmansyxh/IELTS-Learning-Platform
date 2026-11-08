import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { EvaluationSchema } from '@/contracts/ai';
import { execute, closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { POST as externalRoute } from '@/app/api/v1/submissions/speaking-external/route';
import { POST as writingRoute } from '@/app/api/v1/submissions/writing/route';
import { call, learnerSession } from './helpers';
import { addDrill, markLearnDone, resetLearning, seedMaterial } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

const db = getDb();
afterAll(async () => {
  await resetLearning();
  await closeDb();
});
beforeEach(async () => {
  resetRateLimits();
  await resetLearning();
});
afterEach(() => {
  delete process.env.AI_ENABLED;
});

type L = Awaited<ReturnType<typeof learnerSession>>;
/* eslint-disable @typescript-eslint/no-explicit-any */
const SC = { fluency: 6, lexical: 6, grammar: 6, pronunciation: 7 };

async function setup(extra: Record<string, unknown>[] = []) {
  await seedMaterial('1.1.1');
  const speaking = Q.speaking({ question_id: 'Q-GTSPK1-001', part: 1, prompt: 'Where do you live?' });
  const writing = Q.writing({ question_id: 'Q-GTWF-001', task_kind: 'TASK1', prompt: 'Write a letter.' });
  const set = await addDrill('1.1.1', [Q.mcq(), speaking, writing, ...extra]);
  const u = await learnerSession();
  await markLearnDone(u.user.id, '1.1.1');
  const a = await call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: set.id } });
  expect(a.status).toBe(201);
  return { u, attemptId: a.json.data.id as string };
}
const record = (u: L, body: Record<string, unknown>) => call(externalRoute, 'POST', '/api/v1/submissions/speaking-external', { cookie: u.cookie, body });
const ctx = (attemptId: string, over: Record<string, unknown> = {}) => ({
  kind: 'SPEAKING_PART1', attempt_id: attemptId, question_id: 'Q-GTSPK1-001', tool: 'CLAUDE', criteria_scores: SC, ...over,
});
const skillRow = async (userId: string) =>
  (await execute(db, sql`SELECT estimated_band AS band, sample_size FROM user_skill_scores WHERE user_id = ${userId} AND skill = 'SPEAKING'`)).rows[0] as any;

describe('POST /submissions/speaking-external (ADR-004)', () => {
  it('201: overall dihitung server (6.25 -> 6.5), method EXTERNAL_AI, sesuai skema, dan masuk radar Speaking', async () => {
    const { u, attemptId } = await setup();
    const r = await record(u, ctx(attemptId, { feedback_text: 'Catatan AI: tempo bagus.' }));
    expect(r.status).toBe(201);
    const ev = r.json.data.evaluation;
    expect(EvaluationSchema.safeParse(ev).success).toBe(true);
    expect(ev).toMatchObject({ method: 'EXTERNAL_AI', overall_band: 6.5, run_number: 1, external_tool: 'CLAUDE', external_feedback: 'Catatan AI: tempo bagus.' });
    expect(ev.criteria.map((c: any) => [c.key, c.band])).toEqual([['fluency', 6], ['lexical', 6], ['grammar', 6], ['pronunciation', 7]]);
    expect(r.json.data.submission).toMatchObject({ kind: 'SPEAKING_PART1', status: 'GRADED', question_id: 'Q-GTSPK1-001' });
    expect(ev.disclaimer).toContain('bukan skor resmi IELTS');

    expect(await skillRow(u.user.id)).toMatchObject({ band: 6.5, sample_size: 1 });
  });

  it('mengirim ulang konteks yang sama menambah run_number pada submission yang sama dan memperbarui radar', async () => {
    const { u, attemptId } = await setup();
    const a = await record(u, ctx(attemptId));
    const b = await record(u, ctx(attemptId, { tool: 'GEMINI', criteria_scores: { fluency: 5, lexical: 5, grammar: 5, pronunciation: 5 } }));
    expect(b.status).toBe(201);
    expect(b.json.data.submission.id).toBe(a.json.data.submission.id);
    expect(b.json.data.evaluation).toMatchObject({ run_number: 2, overall_band: 5, external_tool: 'GEMINI' });
    const n = (await execute(db, sql`SELECT count(*) AS n FROM submissions WHERE user_id = ${u.user.id}`)).rows[0] as any;
    expect(n.n).toBe(1);
    expect(await skillRow(u.user.id)).toMatchObject({ band: 5, sample_size: 1 });
  });

  it('nilai sendiri (SELF_ASSESSMENT) tetap tidak dihitung radar', async () => {
    const { u, attemptId } = await setup();
    const r = await record(u, ctx(attemptId));
    await execute(db, sql`UPDATE ai_evaluations SET method = 'SELF_ASSESSMENT' WHERE submission_id = ${r.json.data.submission.id}`);
    // pemicu ulang hitung lewat kiriman kedua tidak mengubah baris lama; cek lewat kiriman pada soal lain
    const r2 = await record(u, ctx(attemptId, { criteria_scores: { fluency: 8, lexical: 8, grammar: 8, pronunciation: 8 } }));
    expect(r2.json.data.evaluation.method).toBe('EXTERNAL_AI');
    expect(await skillRow(u.user.id)).toMatchObject({ band: 8, sample_size: 1 });
  });

  it('400: band bukan kelipatan 0.5, kunci overall_band dari klien, tool tak dikenal, field tak dikenal', async () => {
    const { u, attemptId } = await setup();
    expect((await record(u, ctx(attemptId, { criteria_scores: { ...SC, fluency: 6.3 } }))).status).toBe(400);
    expect((await record(u, ctx(attemptId, { overall_band: 9 }))).status).toBe(400);
    expect((await record(u, ctx(attemptId, { tool: 'BARD' }))).status).toBe(400);
    expect((await record(u, ctx(attemptId, { role: 'admin' }))).status).toBe(400);
    expect(await skillRow(u.user.id)).toBeUndefined();
  });

  it('401 tanpa sesi; 404 untuk attempt milik pengguna lain dan soal yang tidak ada', async () => {
    const { u, attemptId } = await setup();
    expect((await call(externalRoute, 'POST', '/api/v1/submissions/speaking-external', { body: ctx(attemptId) })).status).toBe(401);
    const other = await learnerSession();
    expect((await record(other, ctx(attemptId))).status).toBe(404);
    expect((await record(u, ctx(attemptId, { question_id: 'Q-TIDAK-ADA' }))).status).toBe(404);
  });

  it('409 QUESTION_TYPE_MISMATCH: part tidak cocok, soal bukan Speaking', async () => {
    const { u, attemptId } = await setup();
    const wrongPart = await record(u, ctx(attemptId, { kind: 'SPEAKING_PART3' }));
    expect(wrongPart.status).toBe(409);
    expect(wrongPart.json.error.code).toBe('QUESTION_TYPE_MISMATCH');
    const notSpeaking = await record(u, ctx(attemptId, { question_id: 'Q-GTWF-001' }));
    expect(notSpeaking.json.error.code).toBe('QUESTION_TYPE_MISMATCH');
  });

  it('400: konteks tidak lengkap (tanpa attempt/soal) atau campuran', async () => {
    const { u, attemptId } = await setup();
    const noAttempt = await record(u, { kind: 'SPEAKING_PART1', tool: 'CLAUDE', criteria_scores: SC });
    expect(noAttempt.status).toBe(400);
    const mixed = await record(u, ctx(attemptId, { sub_module_id: '3b241101-e2bb-4255-8caf-4136c566a962' }));
    expect(mixed.status).toBe(400);
  });
});

describe('perbaikan pencarian soal Writing berbasis attempt (POST /submissions/writing)', () => {
  it('menemukan soal lewat question_id dan menerima task_kind TASK1 untuk kind WRITING_TASK1', async () => {
    process.env.AI_ENABLED = 'false'; // jalur cadangan: validasi konteks tetap berjalan, tanpa antrean AI
    const { u, attemptId } = await setup();
    const r = await call(writingRoute, 'POST', '/api/v1/submissions/writing', {
      cookie: u.cookie,
      body: { kind: 'WRITING_TASK1', attempt_id: attemptId, question_id: 'Q-GTWF-001', response_text: 'Dear Sir or Madam, '.repeat(10) },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(202);
    expect(r.json.data.submission).toMatchObject({ kind: 'WRITING_TASK1', question_id: 'Q-GTWF-001', status: 'FALLBACK_SELF_ASSESSMENT' });
  });

  it('409 bila kind tidak cocok dengan task_kind soal', async () => {
    process.env.AI_ENABLED = 'false';
    const { u, attemptId } = await setup();
    const r = await call(writingRoute, 'POST', '/api/v1/submissions/writing', {
      cookie: u.cookie,
      body: { kind: 'WRITING_TASK2', attempt_id: attemptId, question_id: 'Q-GTWF-001', response_text: 'Dear Sir or Madam, '.repeat(10) },
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('QUESTION_TYPE_MISMATCH');
  });
});
