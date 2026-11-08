/**
 * Antrean job dalam proses (SPEC-025 Fase 3), pengganti pg-boss + proses worker terpisah.
 *
 * - FIFO di memori; job AI (STT/penilaian) berbagi satu slot (concurrency 1, ADR-001/002).
 * - Status yang dilihat UI tetap ada di tabel `async_jobs` (ditulis oleh pipeline). Saat start, job yang masih
 *   QUEUED/RUNNING di tabel itu dimasukkan kembali agar tidak hilang setelah aplikasi dimatikan.
 * - Gagal (exception) diulang maksimal `MAX_ATTEMPTS` dengan jeda bertahap; pipeline sendiri menandai FAILED/fallback.
 * - Retensi harian dijalankan oleh timer proses ini.
 * - State disimpan di globalThis agar tahan HMR Next dev.
 */
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { asyncJobs } from '@/db/schema';
import { AI_QUEUES, type QueueName } from './queues';
import { getDb } from '../db';
import { logger } from '../logger';
import { safeErr } from '../safe-error';

interface QueuedJob {
  id: string;
  queue: QueueName;
  data: Record<string, unknown>;
  attempt: number;
}
interface QueueState {
  items: QueuedJob[];
  running: Map<string, QueuedJob>;
  aiBusy: boolean;
  draining: boolean;
  recovered: boolean;
  purgeTimer?: NodeJS.Timeout;
  idleWaiters: Array<() => void>;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = [0, 30_000, 120_000];
const PURGE_EVERY_MS = 24 * 3600 * 1000;

const g = globalThis as unknown as { __jobQueue?: QueueState };
const state: QueueState = (g.__jobQueue ??= { items: [], running: new Map(), aiBusy: false, draining: false, recovered: false, idleWaiters: [] });

const KIND_TO_QUEUE: Record<string, QueueName> = {
  STT_TRANSCRIBE: 'stt-transcribe',
  GRADE_WRITING: 'ai-grade-writing',
  GRADE_SPEAKING: 'ai-grade-speaking',
};

async function handlerFor(queue: QueueName) {
  const { jobHandlers } = await import('./registry');
  return jobHandlers[queue];
}

async function runOne(job: QueuedJob): Promise<void> {
  const handler = await handlerFor(job.queue);
  await handler([{ id: job.id, name: job.queue, data: job.data }], { log: logger as never });
}

function settle(): void {
  if (state.items.length === 0 && state.running.size === 0) {
    const w = state.idleWaiters.splice(0);
    for (const r of w) r();
  }
}

async function drain(): Promise<void> {
  if (state.draining) return;
  state.draining = true;
  try {
    for (;;) {
      const idx = state.items.findIndex((j) => !(AI_QUEUES.includes(j.queue) && state.aiBusy));
      if (idx < 0) break;
      const [job] = state.items.splice(idx, 1);
      if (!job) break;
      const isAi = AI_QUEUES.includes(job.queue);
      if (isAi) state.aiBusy = true;
      state.running.set(job.id, job);
      void runOne(job)
        .catch((err) => {
          logger.error({ err: safeErr(err), queue: job.queue, attempt: job.attempt }, 'job_gagal');
          if (job.attempt + 1 < MAX_ATTEMPTS) {
            const retry = { ...job, attempt: job.attempt + 1 };
            const t = setTimeout(() => {
              state.items.push(retry);
              void drain();
            }, RETRY_DELAY_MS[retry.attempt] ?? 120_000);
            t.unref?.();
          }
        })
        .finally(() => {
          state.running.delete(job.id);
          if (isAi) state.aiBusy = false;
          void drain();
          settle();
        });
    }
  } finally {
    state.draining = false;
  }
}

/** Masukkan kembali job yang belum selesai dari proses sebelumnya (sekali per proses). */
async function recover(): Promise<void> {
  if (state.recovered) return;
  state.recovered = true;
  try {
    const rows = await getDb()
      .select({ id: asyncJobs.id, kind: asyncJobs.kind, submissionId: asyncJobs.submissionId })
      .from(asyncJobs)
      .where(inArray(asyncJobs.status, ['QUEUED', 'RUNNING']));
    for (const r of rows) {
      const queue = KIND_TO_QUEUE[r.kind];
      if (!queue || !r.submissionId) continue;
      state.items.push({ id: randomUUID(), queue, data: { submission_id: r.submissionId, async_job_id: r.id }, attempt: 0 });
    }
    if (rows.length > 0) logger.info({ count: rows.length }, 'job_dipulihkan');
  } catch (err) {
    logger.warn({ err: safeErr(err) }, 'job_pemulihan_gagal');
  }
}

function ensurePurgeTimer(): void {
  if (state.purgeTimer || process.env.NODE_ENV === 'test') return;
  state.purgeTimer = setInterval(() => {
    void enqueue('retention-purge', {});
  }, PURGE_EVERY_MS);
  state.purgeTimer.unref?.();
}

/** Kirim job; mengembalikan id job. Penjalanan tidak memblokir pemanggil. */
export async function enqueue(queue: QueueName, data: Record<string, unknown>): Promise<string | null> {
  await recover();
  ensurePurgeTimer();
  const id = randomUUID();
  state.items.push({ id, queue, data, attempt: 0 });
  void drain();
  return id;
}

/** Hanya untuk pengujian: tunggu sampai antrean kosong dan tidak ada job berjalan. */
export function waitForQueueIdle(): Promise<void> {
  if (state.items.length === 0 && state.running.size === 0) return Promise.resolve();
  return new Promise((resolve) => state.idleWaiters.push(resolve));
}

export async function closeQueue(): Promise<void> {
  if (state.purgeTimer) clearInterval(state.purgeTimer);
  state.purgeTimer = undefined;
  state.items.length = 0;
  state.recovered = false;
}
