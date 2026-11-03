import {
  AttemptResponseSchema,
  AttemptResultResponseSchema,
  SubmitAnswerResponseSchema,
  type AnswerResponse,
} from '@/contracts/attempts';
import { apiFetch } from './client';

export const attemptsApi = {
  start: async (assessmentSetId: string) =>
    (
      await apiFetch('/attempts', {
        method: 'POST',
        body: { assessment_set_id: assessmentSetId },
        schema: AttemptResponseSchema,
      })
    ).data,

  get: async (attemptId: string, signal?: AbortSignal) =>
    (await apiFetch(`/attempts/${attemptId}`, { schema: AttemptResponseSchema, signal })).data,

  /** Hanya `response`; waktu, skor, dan kebenaran dihitung server. */
  answer: async (attemptId: string, questionId: string, response: AnswerResponse) =>
    (
      await apiFetch(`/attempts/${attemptId}/answers/${encodeURIComponent(questionId)}`, {
        method: 'PUT',
        body: { response },
        schema: SubmitAnswerResponseSchema,
      })
    ).data,

  submit: async (attemptId: string) =>
    (await apiFetch(`/attempts/${attemptId}/submit`, { method: 'POST', schema: AttemptResultResponseSchema })).data,

  result: async (attemptId: string, signal?: AbortSignal) =>
    (await apiFetch(`/attempts/${attemptId}/result`, { schema: AttemptResultResponseSchema, signal })).data,
};
