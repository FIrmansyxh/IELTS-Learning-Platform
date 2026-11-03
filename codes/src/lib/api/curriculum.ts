import { CurriculumTreeResponseSchema } from '@/contracts/curriculum';
import { apiFetch } from './client';

export const curriculumApi = {
  tree: async (signal?: AbortSignal) =>
    (await apiFetch('/curriculum/tree', { schema: CurriculumTreeResponseSchema, signal })).data,
};
