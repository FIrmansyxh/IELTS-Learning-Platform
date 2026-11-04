import { apiFetch } from './client';
import { PointsListResponseSchema, StatsResponseSchema } from './gamification-contract';

/** Endpoint SPEC-016. Klien tidak pernah mengirim poin/mahkota: semuanya dihitung server. */
export const gamificationApi = {
  stats: async (signal?: AbortSignal) => (await apiFetch('/me/stats', { schema: StatsResponseSchema, signal })).data,
  points: (p: { page: number; page_size: number }, signal?: AbortSignal) =>
    apiFetch('/me/points', { query: p, schema: PointsListResponseSchema, signal }),
};
