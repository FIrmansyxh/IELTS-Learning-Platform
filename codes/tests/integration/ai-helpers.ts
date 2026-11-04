/** Fabrik bersama itest SPEC-012/013: konteks Mini-Task/attempt, menjalankan job worker secara langsung, pembersihan. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { setLlmClientForTest } from '@/server/ai/llm';
import { setSttClientForTest } from '@/server/ai/stt';
import { resetPingCache } from '@/server/ai/service';
import { getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { jobHandlers } from '@/worker/registry';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { POST as writingRoute } from '@/app/api/v1/submissions/writing/route';
import { Q } from '../fixtures/content/builders';
import { call, learnerSession } from './helpers';
import { addDrill, markLearnDone, resetLearning, seedMaterial, subId } from './learning-fixtures';

export type L = Awaited<ReturnType<typeof learnerSession>>;
/* eslint-disable @typescript-eslint/no-explicit-any */

export const AI_ENV = { AI_ENABLED: 'true', LLM_DRIVER: 'mock', STT_DRIVER: 'mock' } as const;

export function setAiEnv(over: Record<string, string | undefined> = {}) {
  for (const [k, v] of Object.entries({ ...AI_ENV, ...over })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/** Reset penuh antar tes: kandidat sisa job/submission AI, data belajar, kuota rate limit, klien tiruan. */
export async function resetAi() {
  resetRateLimits();
  resetPingCache();
  setLlmClientForTest(null);
  setSttClientForTest(null);
  for (const k of ['MOCK_LLM_MODE', 'MOCK_LLM_LATENCY_MS', 'MOCK_LLM_BAND', 'MOCK_STT_MODE', 'MOCK_STT_TRANSCRIPT', 'MOCK_STT_CONFIDENCE']) delete process.env[k];
  setAiEnv();
  const db = getDb();
  await db.execute(sql`DELETE FROM async_jobs WHERE kind IN ('STT_TRANSCRIBE','GRADE_WRITING','GRADE_SPEAKING')`);
  await db.execute(sql`DELETE FROM submissions`);
  await db.execute(sql`DELETE FROM pgboss.job WHERE name IN ('stt-transcribe','ai-grade-writing','ai-grade-speaking')`);
  await db.execute(sql`UPDATE app_settings SET value = to_jsonb(10) WHERE key = 'ai.daily_limit_per_user'`);
  await db.execute(sql`UPDATE app_settings SET value = to_jsonb(20) WHERE key = 'ai.queue_max'`);
  await db.execute(sql`UPDATE app_settings SET value = to_jsonb(90) WHERE key = 'retention.audio_days'`);
  await resetLearning();
}

export const words = (n: number, w = 'study') => Array.from({ length: n }, () => w).join(' ');

/** Sub-modul 1.1.1 dengan Mini-Task AI + materi selesai untuk `u`. */
/** Seed materi hanya bila belum ada (aman dipanggil berulang dalam satu tes). */
export async function ensureMaterial(code: string, opts: Parameters<typeof seedMaterial>[1] = {}, replace = false) {
  const db = getDb();
  const sid = await subId(code);
  if (replace) await db.execute(sql`DELETE FROM learning_materials WHERE sub_module_id = ${sid}::uuid`);
  const has = await db.execute(sql`SELECT 1 FROM learning_materials WHERE sub_module_id = ${sid}::uuid`);
  if (has.rows.length === 0) return seedMaterial(code, opts);
  return { subId: sid, slideAssets: [], docAssets: [] };
}

export async function miniTaskUser(task: 'AI_SHORT_WRITING' | 'AI_SHORT_SPEAKING' = 'AI_SHORT_WRITING', learnDone = true) {
  const m = await ensureMaterial('1.1.1', { miniTask: task }, true);
  await ensureMaterial('1.1.2');
  const u = await learnerSession();
  if (learnDone) await markLearnDone(u.user.id, '1.1.1');
  return { u, subModuleId: m.subId };
}

/** Attempt IN_PROGRESS pada set drill berisi soal Writing/Speaking; mengembalikan id attempt dan soal. */
export async function attemptWith(questions: unknown[], u?: L) {
  await ensureMaterial('1.1.1');
  await ensureMaterial('1.1.2');
  const set = await addDrill('1.1.1', questions);
  const user = u ?? (await learnerSession());
  await markLearnDone(user.user.id, '1.1.1');
  const r = await call(startRoute, 'POST', '/api/v1/attempts', { cookie: user.cookie, body: { assessment_set_id: set.id } });
  if (r.status !== 201) throw new Error(`gagal memulai attempt: ${r.status} ${JSON.stringify(r.json)}`);
  return { u: user, attemptId: r.json.data.id as string, setId: set.id };
}

export const writingQ = (id: string, over: Record<string, unknown> = {}) => Q.writing({ question_id: id, prompt: `Soal tulis ${id}`, min_words: 250, task_kind: 'TASK2', ...over });
export const speakingQ = (id: string, over: Record<string, unknown> = {}) => Q.speaking({ question_id: id, prompt: `Soal bicara ${id}`, part: 2, ...over });

export function collectLog() {
  const calls: unknown[] = [];
  const push = (...a: unknown[]) => void calls.push(a);
  return { calls, log: { info: push, warn: push, error: push } as any };
}

/** Jalankan satu job pg-boss palsu lewat handler worker nyata (jobHandlers). Melempar bila handler melempar (ulang pg-boss). */
export async function runJob(jobId: string, opts: { log?: any } = {}) {
  const r = await getDb().execute(sql`SELECT kind, submission_id FROM async_jobs WHERE id = ${jobId}::uuid`);
  const row = r.rows[0] as { kind: string; submission_id: string };
  const name = { GRADE_WRITING: 'ai-grade-writing', GRADE_SPEAKING: 'ai-grade-speaking', STT_TRANSCRIBE: 'stt-transcribe' }[row.kind] as 'ai-grade-writing';
  const log = opts.log ?? collectLog().log;
  await jobHandlers[name]([{ id: randomUUID(), name, data: { submission_id: row.submission_id, async_job_id: jobId } }], { log });
}

export async function latestJobId(submissionId: string, kind?: string): Promise<string> {
  const r = await getDb().execute(
    kind
      ? sql`SELECT id FROM async_jobs WHERE submission_id = ${submissionId}::uuid AND kind = ${kind}::async_job_kind ORDER BY created_at DESC LIMIT 1`
      : sql`SELECT id FROM async_jobs WHERE submission_id = ${submissionId}::uuid ORDER BY created_at DESC LIMIT 1`,
  );
  return (r.rows[0] as { id: string }).id;
}

export async function rowOf(table: 'submissions' | 'async_jobs' | 'ai_evaluations' | 'speaking_recordings', where: string, val: string): Promise<any> {
  const r = await getDb().execute(sql.raw(`SELECT * FROM ${table} WHERE ${where} = '${val.replace(/'/g, "''")}' ORDER BY created_at DESC LIMIT 1`));
  return r.rows[0];
}

export const postWriting = (u: L, body: unknown) => call(writingRoute, 'POST', '/api/v1/submissions/writing', { cookie: u.cookie, body });
