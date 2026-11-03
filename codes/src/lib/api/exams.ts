import { ExamIntroResponseSchema } from '@/contracts/exams';
import { apiFetch } from './client';

export const examsApi = {
  intro: async (assessmentSetId: string, signal?: AbortSignal) =>
    (await apiFetch(`/exams/${assessmentSetId}/intro`, { schema: ExamIntroResponseSchema, signal })).data,
};
