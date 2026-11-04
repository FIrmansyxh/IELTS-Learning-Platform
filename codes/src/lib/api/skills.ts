import { apiFetch } from './client';
import {
  BandPredictionsResponseSchema,
  ExamHistoryResponseSchema,
  RadarResponseSchema,
  type ExamHistoryItem,
} from './skills-contract';

/** Endpoint SPEC-017 (hanya data milik pemanggil; tanpa parameter user). */
export const skillsApi = {
  radar: async (signal?: AbortSignal) => (await apiFetch('/me/skills/radar', { schema: RadarResponseSchema, signal })).data,
  predictions: (p: { page: number; page_size: number }, signal?: AbortSignal) =>
    apiFetch('/me/band-predictions', { query: p, schema: BandPredictionsResponseSchema, signal }),
  examHistory: (p: { page: number; page_size: number; assessment_type?: ExamHistoryItem['assessment_type'] }, signal?: AbortSignal) =>
    apiFetch('/me/exam-history', { query: p, schema: ExamHistoryResponseSchema, signal }),
};
