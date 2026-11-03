import type { Logger } from 'pino';
import type { QueueName } from './queues';
import { purgeTasks } from './purge';
import { runImportPublish, runImportValidate } from '../server/import/jobs';

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

/** Handler kosong SPEC-000: mencatat warn lalu job dianggap selesai. Spec lain mengganti entri ini. */
function notImplemented(): Handler {
  return async (jobs, { log }) => {
    for (const job of jobs) {
      log.warn({ jobId: job.id }, 'handler belum diimplementasikan');
    }
  };
}

export const jobHandlers: Record<QueueName, Handler> = {
  'stt-transcribe': notImplemented(),
  'ai-grade-writing': notImplemented(),
  'ai-grade-speaking': notImplemented(),
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
    for (const task of purgeTasks) {
      log.info({ task: task.name }, 'menjalankan purge task');
      await task.run();
    }
  },
};

export { purgeTasks };
