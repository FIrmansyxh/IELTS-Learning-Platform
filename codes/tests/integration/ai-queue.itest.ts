import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { MockLlmClient, setLlmClient } from '@/server/ai/llm';
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
  vi.unstubAllEnvs();
  setLlmClient(undefined);
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

  it('job pertama setelah proses menyala dinilai tepat sekali (pemulihan tidak menggandakan job yang baru dibuat)', async () => {
    // Bukan mock/test: jalur inline `LLM_DRIVER=mock || NODE_ENV=test` mematikan satu-satunya penjalan lewat antrean.
    vi.stubEnv('NODE_ENV', 'production');
    process.env.AI_ENABLED = 'true';
    process.env.LLM_DRIVER = 'llamacpp';
    const mock = new MockLlmClient();
    let calls = 0;
    setLlmClient({
      name: mock.name,
      ping: () => mock.ping(),
      generate: async (req) => {
        calls += 1;
        return mock.generate(req);
      },
    });
    // Simulasikan proses yang baru menyala: pemulihan belum pernah berjalan.
    (globalThis as unknown as { __jobQueue: { recovered: boolean } }).__jobQueue.recovered = false;

    await seedMaterial('1.1.1');
    const writing = Q.writing({ question_id: 'Q-GTWQ-001', task_kind: 'TASK1', prompt: 'Write a letter to your neighbour.' });
    const set = await addDrill('1.1.1', [Q.mcq(), writing]);
    const u = await learnerSession();
    await markLearnDone(u.user.id, '1.1.1');
    const a = await call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: set.id } });
    const r = await call(writingRoute, 'POST', '/api/v1/submissions/writing', {
      cookie: u.cookie,
      body: { kind: 'WRITING_TASK1', attempt_id: a.json.data.id, question_id: 'Q-GTWQ-001', response_text: 'Dear Ms Rivera, I am writing to raise a polite concern about noise. '.repeat(12) },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(202);

    await waitForQueueIdle();

    expect(calls).toBe(1);
    const evs = (await execute(db, sql`SELECT COUNT(*) AS n FROM ai_evaluations WHERE submission_id = ${r.json.data.submission.id}`)).rows[0] as any;
    expect(Number(evs.n)).toBe(1);
  });

  describe('komentar generik dari LLM', () => {
    /** Kirim satu Writing lewat jalur antrean (bukan inline) dan kembalikan id submission. */
    async function submitWriting(): Promise<string> {
      vi.stubEnv('NODE_ENV', 'production');
      process.env.AI_ENABLED = 'true';
      process.env.LLM_DRIVER = 'llamacpp';
      (globalThis as unknown as { __jobQueue: { recovered: boolean } }).__jobQueue.recovered = true;
      await seedMaterial('1.1.1');
      const writing = Q.writing({ question_id: 'Q-GTWQ-001', task_kind: 'TASK1', prompt: 'Write a letter to your neighbour.' });
      const set = await addDrill('1.1.1', [Q.mcq(), writing]);
      const u = await learnerSession();
      await markLearnDone(u.user.id, '1.1.1');
      const a = await call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: set.id } });
      const r = await call(writingRoute, 'POST', '/api/v1/submissions/writing', {
        cookie: u.cookie,
        body: { kind: 'WRITING_TASK1', attempt_id: a.json.data.id, question_id: 'Q-GTWQ-001', response_text: 'Dear Ms Rivera, I am writing to raise a polite concern about noise. '.repeat(12) },
      });
      expect(r.status, JSON.stringify(r.json)).toBe(202);
      return r.json.data.submission.id as string;
    }

    /** Klien yang mengembalikan keluaran contoh; `generic[i]` = apakah panggilan ke-i berisi komentar generik. */
    function clientWith(generic: boolean[], counter: { calls: number; prompts: string[] }) {
      const mock = new MockLlmClient();
      setLlmClient({
        name: mock.name,
        ping: () => mock.ping(),
        generate: async (req) => {
          const i = counter.calls++;
          counter.prompts.push(req.userPrompt);
          const base = await mock.generate(req);
          if (!generic[i]) return base;
          const j = JSON.parse(base.content);
          for (const c of Object.values(j.criteria) as Array<{ comment_id: string }>) c.comment_id = 'Komentar mengenai pencapaian tugas';
          return { ...base, content: JSON.stringify(j) };
        },
      });
    }

    it('komentar generik: dinilai ulang sekali, hasil kedua (berisi) yang disimpan', async () => {
      const counter = { calls: 0, prompts: [] as string[] };
      clientWith([true, false], counter);
      const id = await submitWriting();
      await waitForQueueIdle();

      expect(counter.calls).toBe(2);
      expect(counter.prompts[1]).toContain('terlalu generik');
      expect(counter.prompts[1]).toContain('criteria.task_response.comment_id');
      const ev = (await execute(db, sql`SELECT feedback_json FROM ai_evaluations WHERE submission_id = ${id}`)).rows as any[];
      expect(ev).toHaveLength(1);
      const fb = typeof ev[0].feedback_json === 'string' ? JSON.parse(ev[0].feedback_json) : ev[0].feedback_json;
      expect(fb.criteria_comments.task_response).not.toBe('Komentar mengenai pencapaian tugas');
      const sub = (await execute(db, sql`SELECT status FROM submissions WHERE id = ${id}`)).rows[0] as any;
      expect(sub.status).toBe('GRADED');
    });

    it('tetap generik setelah ulang: evaluasi tidak gagal, dipakai keluaran pertama, hanya dua panggilan', async () => {
      const counter = { calls: 0, prompts: [] as string[] };
      clientWith([true, true, true], counter);
      const id = await submitWriting();
      await waitForQueueIdle();

      expect(counter.calls).toBe(2);
      const sub = (await execute(db, sql`SELECT status FROM submissions WHERE id = ${id}`)).rows[0] as any;
      expect(sub.status).toBe('GRADED');
    });
  });

  it('P4-60: antrean dari src/server/jobs menjalankan retention-purge sampai selesai tanpa galat', async () => {
    process.env.AI_ENABLED = 'true';
    process.env.LLM_DRIVER = 'mock';
    const id = await enqueue('retention-purge', {});
    expect(id).not.toBeNull();
    await expect(waitForQueueIdle()).resolves.toBeUndefined();
  });
});
