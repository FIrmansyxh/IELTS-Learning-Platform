/** Definisi queue pg-boss. Dibuat oleh scripts/migrate.ts (peran app_migrator), bukan oleh worker runtime. */
export const QUEUE_NAMES = [
  'stt-transcribe',
  'ai-grade-writing',
  'ai-grade-speaking',
  'import-validate',
  'import-publish',
  'retention-purge',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/** Queue AI berbagi satu slot eksekusi (concurrency AI = 1, ADR-001/002). */
export const AI_QUEUES: readonly QueueName[] = ['stt-transcribe', 'ai-grade-writing', 'ai-grade-speaking'];

export interface QueueOptionsDef {
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  expireInSeconds?: number;
}

export function queueOptions(name: QueueName, aiJobTimeoutSec: number): QueueOptionsDef {
  if (AI_QUEUES.includes(name)) {
    return { retryLimit: 2, retryDelay: 30, retryBackoff: true, expireInSeconds: aiJobTimeoutSec + 60 };
  }
  return { retryLimit: 1, retryDelay: 30, expireInSeconds: 900 };
}
