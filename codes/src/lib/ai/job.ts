import type { SubmissionStatusType } from '@/lib/api/ai-contract';

export const TERMINAL_STATUSES: readonly SubmissionStatusType[] = ['GRADED', 'FAILED', 'FALLBACK_SELF_ASSESSMENT'];

export function isTerminalStatus(s: SubmissionStatusType): boolean {
  return TERMINAL_STATUSES.includes(s);
}

/** Polling SPEC-012: 2 detik selama 30 detik pertama, lalu 5 detik. */
export function pollIntervalMs(elapsedMs: number): number {
  return elapsedMs < 30_000 ? 2_000 : 5_000;
}

/** Kode galat yang tidak dapat di-retry (rekam ulang sebagai submission baru). */
export const NON_RETRYABLE_CODES: readonly string[] = ['AUDIO_TOO_SHORT', 'AUDIO_TOO_LONG', 'AUDIO_UNREADABLE', 'STT_EMPTY'];

export const MAX_RETRIES = 3;
