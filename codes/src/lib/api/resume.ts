import {
  ResumeCardResponseSchema,
  UpdateLastLearnedResponseSchema,
  type UpdateLastLearnedRequest,
} from '@/contracts/resume';
import { apiFetch } from './client';

export const resumeApi = {
  get: async (signal?: AbortSignal) => (await apiFetch('/me/last-learned', { schema: ResumeCardResponseSchema, signal })).data,

  update: async (body: UpdateLastLearnedRequest, keepalive = false) =>
    (
      await apiFetch('/me/last-learned', {
        method: 'PUT',
        body,
        keepalive,
        schema: UpdateLastLearnedResponseSchema,
      })
    ).data,
};
