import type { Logger } from 'pino';
import type { QueueName } from './queues';
import { purgeTasks } from './purge';
import { runImportPublish, runImportValidate } from '../server/import/jobs';
import { processWritingEvaluation } from '../server/ai/pipeline';
import {
  processSpeakingEvaluation,
  processSttTranscription,
} from '../server/ai/speaking-pipeline';

interface ImportJobData {
  batch_id?: string;
  async_job_id?: string;
}

interface WritingJobData {
  submission_id?: string;
  async_job_id?: string;
}

interface SpeakingJobData {
  submission_id?: string;
  async_job_id?: string;
}

export interface JobLike {
  id: string;
  name: string;
  data: unknown;
}

export type Handler = (jobs: JobLike[], ctx: { log: Logger }) => Promise<void>;

export const jobHandlers: Record<QueueName, Handler> = {
  'stt-transcribe': async (jobs, { log }) => {
    for (const job of jobs) {
      const d = job.data as SpeakingJobData;
      if (d.submission_id) {
        log.info({ jobId: job.id, submissionId: d.submission_id }, 'menjalankan stt-transcribe');
        await processSttTranscription(d.submission_id, d.async_job_id);
      }
    }
  },
  'ai-grade-writing': async (jobs, { log }) => {
    for (const job of jobs) {
      const d = job.data as WritingJobData;
      if (d.submission_id) {
        log.info({ jobId: job.id, submissionId: d.submission_id }, 'menjalankan ai-grade-writing');
        await processWritingEvaluation(d.submission_id, d.async_job_id);
      }
    }
  },
  'ai-grade-speaking': async (jobs, { log }) => {
    for (const job of jobs) {
      const d = job.data as SpeakingJobData;
      if (d.submission_id) {
        log.info({ jobId: job.id, submissionId: d.submission_id }, 'menjalankan ai-grade-speaking');
        await processSpeakingEvaluation(d.submission_id, d.async_job_id);
      }
    }
  },
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
