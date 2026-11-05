import {
  StatsResponseSchema,
  PointsHistoryResponseSchema,
  type PointsHistoryQuery,
} from '@/contracts/gamification';
import { apiFetch } from './client';

export const gamificationApi = {
  stats: async (signal?: AbortSignal) =>
    (await apiFetch('/me/stats', { schema: StatsResponseSchema, signal })).data,

  points: async (query?: Partial<PointsHistoryQuery>, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query?.page) params.set('page', String(query.page));
    if (query?.page_size) params.set('page_size', String(query.page_size));
    const qs = params.toString();
    const path = qs ? `/me/points?${qs}` : '/me/points';
    return await apiFetch(path, { schema: PointsHistoryResponseSchema, signal });
  },
};

