import { z } from 'zod';
import {
  EvaluationSchema,
  SubmissionQuotaSchema,
  SubmissionSchema,
  type CreateWritingSubmissionRequest,
} from '@/contracts/ai';
import { apiFetch } from './client';

const WithQuota = z.object({ data: z.object({ submission: SubmissionSchema, quota: SubmissionQuotaSchema }) });
const Single = z.object({ data: z.object({ submission: SubmissionSchema }) });
const WithEvaluation = z.object({ data: z.object({ submission: SubmissionSchema, evaluation: EvaluationSchema }) });

/** Klien Writing: kirim, polling status, coba lagi, dan nilai sendiri (SPEC-012). */
export const submissionsApi = {
  createWriting: async (body: CreateWritingSubmissionRequest) =>
    (await apiFetch('/submissions/writing', { method: 'POST', body, schema: WithQuota })).data,

  get: async (submissionId: string, signal?: AbortSignal) =>
    (await apiFetch(`/submissions/${submissionId}`, { schema: Single, signal })).data.submission,

  retry: async (submissionId: string) =>
    (await apiFetch(`/submissions/${submissionId}/retry`, { method: 'POST', schema: WithQuota })).data,

  selfAssess: async (submissionId: string, criteria_scores: Record<string, number>) =>
    (
      await apiFetch(`/submissions/${submissionId}/self-assessment`, {
        method: 'POST',
        body: { criteria_scores },
        schema: WithEvaluation,
      })
    ).data,
};
