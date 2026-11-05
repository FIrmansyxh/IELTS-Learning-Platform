import {
  BandPredictionsResponseSchema,
  ExamHistoryResponseSchema,
  RadarResponseSchema,
  type BandPredictionsQuery,
  type ExamHistoryQuery,
} from '@/contracts/skills';
import { apiFetch } from './client';

export const skillsApi = {
  radar: async (signal?: AbortSignal) =>
    (await apiFetch('/me/skills/radar', { schema: RadarResponseSchema, signal })).data,

  bandPredictions: async (query?: Partial<BandPredictionsQuery>, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query?.page) params.set('page', String(query.page));
    if (query?.page_size) params.set('page_size', String(query.page_size));
    const qs = params.toString();
    const path = qs ? `/me/band-predictions?${qs}` : '/me/band-predictions';
    return await apiFetch(path, { schema: BandPredictionsResponseSchema, signal });
  },

  examHistory: async (query?: Partial<ExamHistoryQuery>, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query?.assessment_type) params.set('assessment_type', query.assessment_type);
    if (query?.page) params.set('page', String(query.page));
    if (query?.page_size) params.set('page_size', String(query.page_size));
    const qs = params.toString();
    const path = qs ? `/me/exam-history?${qs}` : '/me/exam-history';
    return await apiFetch(path, { schema: ExamHistoryResponseSchema, signal });
  },
};

