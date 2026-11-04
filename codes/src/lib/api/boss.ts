import { apiFetch } from './client';
import { StartSectionResponseSchema, SubmitSectionResponseSchema } from './boss-contract';

/** Endpoint section Boss Stage (SPEC-014). Soal, audio, dan jawaban section hanya datang dari `start`. */
export const bossApi = {
  startSection: async (attemptId: string, sectionSetId: string) =>
    (
      await apiFetch(`/attempts/${attemptId}/sections/${sectionSetId}/start`, {
        method: 'POST',
        schema: StartSectionResponseSchema,
      })
    ).data,

  submitSection: async (attemptId: string, sectionSetId: string) =>
    (
      await apiFetch(`/attempts/${attemptId}/sections/${sectionSetId}/submit`, {
        method: 'POST',
        schema: SubmitSectionResponseSchema,
      })
    ).data,
};
