import { ActiveMixSessionResponseSchema, MixRequestSchema, MixSessionResponseSchema, type MixRequest } from '@/contracts/mix';
import { BanksResponseSchema } from '@/contracts/question-bank';
import { ReviewSummaryResponseSchema } from '@/contracts/review';
import { apiFetch } from './client';

export type { MixRequest };
export { MixRequestSchema };

/** Banyaknya soal yang tersedia dari `details[0].code = "max_available:<n>"` (422 MIX_NOT_ENOUGH_QUESTIONS). */
export function parseMaxAvailable(details: Array<{ code: string }> | undefined): number | null {
  const code = details?.find((d) => d.code.startsWith('max_available:'))?.code;
  if (!code) return null;
  const n = Number(code.slice('max_available:'.length));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Klien Latihan Campur (SPEC-022). Alur jawab/submit/hasil memakai `attemptsApi`. */
export const mixApi = {
  banks: async (signal?: AbortSignal) => (await apiFetch('/banks', { schema: BanksResponseSchema, signal })).data,

  /** Sesi campur IN_PROGRESS milik profil, atau null. */
  active: async (signal?: AbortSignal) =>
    (await apiFetch('/mix-sessions/active', { schema: ActiveMixSessionResponseSchema, signal })).data,

  /** Ringkasan pengulangan berjarak (SPEC-026). */
  reviews: async (signal?: AbortSignal) =>
    (await apiFetch('/me/reviews', { schema: ReviewSummaryResponseSchema, signal })).data,

  start: async (body: MixRequest) =>
    (await apiFetch('/mix-sessions', { method: 'POST', body, schema: MixSessionResponseSchema })).data,
};
