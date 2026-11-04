import type { Logger } from 'pino';
import type { QueueName } from './queues';
import { purgeTasks } from './purge';
import { safeErr } from '../server/safe-error';
import { runImportPublish, runImportValidate } from '../server/import/jobs';
import { runGradeSpeaking, runGradeWriting, runSttTranscribe, type AiJobData } from '../server/ai/pipeline';

interface ImportJobData {
  batch_id?: string;
  async_job_id?: string;
}

export interface JobLike {
  id: string;
  name: string;
  data: unknown;
}

export type Handler = (jobs: JobLike[], ctx: { log: Logger }) => Promise<void>;

/**
 * Handler job AI (SPEC-012/013). Galat infrastruktur dilempar agar pg-boss mengulang; kegagalan permanen sudah dicatat di
 * `async_jobs` oleh pipeline. Job tanpa data lengkap diabaikan (tidak dapat diproses ulang).
 */
function aiHandler(run: (data: AiJobData, deps: { log: Logger }) => Promise<void>): Handler {
  return async (jobs, { log }) => {
    for (const job of jobs) {
      const d = job.data as Partial<AiJobData>;
      if (!d.submission_id || !d.async_job_id) {
        log.warn({ jobId: job.id }, 'job AI tanpa submission_id/async_job_id diabaikan');
        continue;
      }
      await run({ submission_id: d.submission_id, async_job_id: d.async_job_id }, { log });
    }
  };
}

/**
 * Jalankan tugas retensi berurutan dengan isolasi galat (F-12-03): satu tugas gagal tidak menghentikan yang lain.
 * Setelah semuanya dicoba, galat digabung dan dilempar agar pg-boss mencatat kegagalan (dan mengulang).
 */
export async function runPurgeTasks(
  tasks: ReadonlyArray<{ name: string; run: () => Promise<void> }>,
  log: Pick<Logger, 'info' | 'error'>,
): Promise<void> {
  const failures: Array<{ name: string; error: unknown }> = [];
  for (const task of tasks) {
    log.info({ task: task.name }, 'menjalankan purge task');
    try {
      await task.run();
    } catch (error) {
      failures.push({ name: task.name, error });
      log.error({ task: task.name, err: safeErr(error) }, 'purge task gagal');
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((f) => f.error),
      `purge task gagal: ${failures.map((f) => f.name).join(', ')}`,
    );
  }
}

export const jobHandlers: Record<QueueName, Handler> = {
  'stt-transcribe': aiHandler(runSttTranscribe),
  'ai-grade-writing': aiHandler(runGradeWriting),
  'ai-grade-speaking': aiHandler(runGradeSpeaking),
  'import-validate': async (jobs, { log }) => {
    for (const job of jobs) {
      const d = job.data as ImportJobData;
      if (d.batch_id) log.info({ jobId: job.id, result: await runImportValidate(d.batch_id, d.async_job_id) }, 'import-validate selesai');
    }
  },
  'import-publish': async (jobs, { log }) => {
    for (const job of jobs) {
      const d = job.data as ImportJobData;
      if (d.batch_id) log.info({ jobId: job.id, result: await runImportPublish(d.batch_id, d.async_job_id) }, 'import-publish selesai');
    }
  },
  'retention-purge': async (_jobs, { log }) => {
    await runPurgeTasks(purgeTasks, log);
  },
};

export { purgeTasks };
