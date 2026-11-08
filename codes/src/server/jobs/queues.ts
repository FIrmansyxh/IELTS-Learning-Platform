/** Nama antrean dalam proses (lihat queue.ts). */
export const QUEUE_NAMES = [
  'stt-transcribe',
  'ai-grade-writing',
  'ai-grade-speaking',
  'retention-purge',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/** Queue AI berbagi satu slot eksekusi (concurrency AI = 1, ADR-001/002). */
export const AI_QUEUES: readonly QueueName[] = ['stt-transcribe', 'ai-grade-writing', 'ai-grade-speaking'];
