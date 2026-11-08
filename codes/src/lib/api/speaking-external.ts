import { z } from 'zod';
import { EvaluationSchema, SubmissionSchema, type ExternalSpeakingEvaluationRequest } from '@/contracts/ai';
import { apiFetch } from './client';

const ResponseSchema = z.object({ data: z.object({ submission: SubmissionSchema, evaluation: EvaluationSchema }) });

export const speakingExternalApi = {
  /** Simpan skor Speaking dari AI pihak ketiga; overall dihitung server (ADR-004). */
  record: async (body: ExternalSpeakingEvaluationRequest) =>
    (await apiFetch('/submissions/speaking-external', { method: 'POST', body, schema: ResponseSchema })).data,
};
