import { z } from 'zod';
import { apiFetch } from './client';
import type {
  AssessmentSetsQuery,
  ChangeStatusRequest,
  ContentRevisionsQuery,
  UpdateAssessmentSetRequest,
  UpdateMaterialRequest,
  UpdateModuleRequest,
  UpdateQuestionRequest,
  UpdateSubModuleRequest,
} from '@/contracts/curation';

const AnyDataResponseSchema = z.object({
  data: z.any(),
  meta: z.any().optional(),
});

export const curationApi = {
  curriculum: async (signal?: AbortSignal) =>
    (await apiFetch('/admin/curriculum', { schema: AnyDataResponseSchema, signal })).data,

  subModule: async (id: string, signal?: AbortSignal) =>
    (await apiFetch(`/admin/sub-modules/${id}`, { schema: AnyDataResponseSchema, signal })).data,

  updateModule: async (id: string, body: UpdateModuleRequest) =>
    (await apiFetch(`/admin/modules/${id}`, { method: 'PATCH', body, schema: AnyDataResponseSchema })).data,

  updateSubModule: async (id: string, body: UpdateSubModuleRequest) =>
    (await apiFetch(`/admin/sub-modules/${id}`, { method: 'PATCH', body, schema: AnyDataResponseSchema })).data,

  updateMaterial: async (id: string, body: UpdateMaterialRequest) =>
    (await apiFetch(`/admin/sub-modules/${id}/material`, { method: 'PATCH', body, schema: AnyDataResponseSchema })).data,

  assessmentSets: async (query?: Partial<AssessmentSetsQuery>, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query?.assessment_type) params.set('assessment_type', query.assessment_type);
    if (query?.status) params.set('status', query.status);
    if (query?.tier_number) params.set('tier_number', String(query.tier_number));
    if (query?.q) params.set('q', query.q);
    if (query?.page) params.set('page', String(query.page));
    if (query?.page_size) params.set('page_size', String(query.page_size));
    const qs = params.toString();
    const path = qs ? `/admin/assessment-sets?${qs}` : '/admin/assessment-sets';
    return await apiFetch(path, { schema: AnyDataResponseSchema, signal });
  },

  assessmentSet: async (id: string, signal?: AbortSignal) =>
    (await apiFetch(`/admin/assessment-sets/${id}`, { schema: AnyDataResponseSchema, signal })).data,

  updateAssessmentSet: async (id: string, body: UpdateAssessmentSetRequest) =>
    (await apiFetch(`/admin/assessment-sets/${id}`, { method: 'PATCH', body, schema: AnyDataResponseSchema })).data,

  updateQuestion: async (setId: string, questionId: string, body: UpdateQuestionRequest) =>
    (
      await apiFetch(`/admin/assessment-sets/${setId}/questions/${encodeURIComponent(questionId)}`, {
        method: 'PATCH',
        body,
        schema: AnyDataResponseSchema,
      })
    ).data,

  changeStatus: async (entity: 'modules' | 'sub-modules' | 'assessment-sets', id: string, body: ChangeStatusRequest) =>
    (await apiFetch(`/admin/${entity}/${id}/status`, { method: 'POST', body, schema: AnyDataResponseSchema })).data,

  quality: async (setId: string, signal?: AbortSignal) =>
    (await apiFetch(`/admin/assessment-sets/${setId}/quality`, { schema: AnyDataResponseSchema, signal })).data,

  revisions: async (query: ContentRevisionsQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    params.set('entity_type', query.entity_type);
    params.set('entity_id', query.entity_id);
    if (query.page) params.set('page', String(query.page));
    if (query.page_size) params.set('page_size', String(query.page_size));
    return await apiFetch(`/admin/content-revisions?${params.toString()}`, {
      schema: AnyDataResponseSchema,
      signal,
    });
  },

  revision: async (revisionId: string, signal?: AbortSignal) =>
    (await apiFetch(`/admin/content-revisions/${revisionId}`, { schema: AnyDataResponseSchema, signal })).data,
};

