import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { execute, closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { enqueue, waitForQueueIdle } from '@/server/jobs/queue';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { POST as writingRoute } from '@/app/api/v1/submissions/writing/route';
import { call, learnerSession } from './helpers';
import { addDrill, markLearnDone, resetLearning, seedMaterial } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

/* eslint-disable @typescript-eslint/no-explicit-any */
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
  delete process.env.LLM_DRIVER;
});

describe('antrean dalam proses (SPEC-025 Fase 3): penilaian Writing', () => {
  it('Writing masuk antrean, dinilai oleh LLM mock, status job dan submission berakhir sukses', async () => {
    process.env.AI_ENABLED = 'true';
    process.env.LLM_DRIVER = 'mock';
    await seedMaterial('1.1.1');
    const writing = Q.writing({ question_id: 'Q-GTWQ-001', task_kind: 'TASK1', prompt: 'Write a letter to your neighbour.' });
    const set = await addDrill('1.1.1', [Q.mcq(), writing]);
    const u = await learnerSession();
    await markLearnDone(u.user.id, '1.1.1');
    const a = await call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: set.id } });
    expect(a.status).toBe(201);

    const r = await call(writingRoute, 'POST', '/api/v1/submissions/writing', {
      cookie: u.cookie,
      body: { kind: 'WRITING_TASK1', attempt_id: a.json.data.id, question_id: 'Q-GTWQ-001', response_text: 'Dear Ms Rivera, I am writing to raise a polite concern about noise. '.repeat(12) },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(202);
    const submissionId = r.json.data.submission.id as string;

    await waitForQueueIdle();

    const sub = (await execute(db, sql`SELECT status FROM submissions WHERE id = ${submissionId}`)).rows[0] as any;
    expect(sub.status).toBe('GRADED');
    const ev = (await execute(db, sql`SELECT method, overall_band FROM ai_evaluations WHERE submission_id = ${submissionId}`)).rows[0] as any;
    expect(ev).toBeTruthy();
    expect(ev.method).toBe('AI_LOCAL');
    const job = (await execute(db, sql`SELECT status, finished_at FROM async_jobs WHERE submission_id = ${submissionId}`)).rows[0] as any;
    expect(job.status).toBe('SUCCEEDED');
    expect(job.finished_at).not.toBeNull();
  });

  it('P4-60: antrean dari src/server/jobs menjalankan retention-purge sampai selesai tanpa galat', async () => {
    process.env.AI_ENABLED = 'true';
    process.env.LLM_DRIVER = 'mock';
    const id = await enqueue('retention-purge', {});
    expect(id).not.toBeNull();
    await expect(waitForQueueIdle()).resolves.toBeUndefined();
  });
});
