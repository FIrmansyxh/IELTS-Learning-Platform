import { apiFetch } from './client';
import {
  ChangeStatusResponseSchema,
  CurriculumResponseSchema,
  MaterialUpdatedResponseSchema,
  ModuleUpdatedResponseSchema,
  QualityResponseSchema,
  QuestionUpdatedResponseSchema,
  RevisionDetailResponseSchema,
  RevisionListResponseSchema,
  SetDetailResponseSchema,
  SetListResponseSchema,
  SetUpdatedResponseSchema,
  SubModuleDetailResponseSchema,
  SubModuleUpdatedResponseSchema,
  type ChangeStatusRequest,
  type RevisionEntityTypeValue,
  type UpdateMaterialRequest,
  type UpdateModuleRequest,
  type UpdateQuestionRequest,
  type UpdateSetRequest,
  type UpdateSubModuleRequest,
} from './curation-contract';

export type StatusEntity = 'modules' | 'sub-modules' | 'assessment-sets';

export type SetListParams = {
  page: number;
  page_size: number;
  assessment_type?: string;
  status?: string;
  tier_number?: number;
  q?: string;
};

/** Endpoint admin kurasi konten (SPEC-020). Kunci jawaban hanya datang untuk sesi admin. */
export const curationApi = {
  curriculum: async (signal?: AbortSignal) =>
    (await apiFetch('/admin/curriculum', { schema: CurriculumResponseSchema, signal })).data,

  subModule: async (subModuleId: string, signal?: AbortSignal) =>
    (await apiFetch(`/admin/sub-modules/${subModuleId}`, { schema: SubModuleDetailResponseSchema, signal })).data,
  updateModule: async (moduleId: string, body: UpdateModuleRequest) =>
    (await apiFetch(`/admin/modules/${moduleId}`, { method: 'PATCH', body, schema: ModuleUpdatedResponseSchema })).data,
  updateSubModule: async (subModuleId: string, body: UpdateSubModuleRequest) =>
    (await apiFetch(`/admin/sub-modules/${subModuleId}`, { method: 'PATCH', body, schema: SubModuleUpdatedResponseSchema })).data,
  updateMaterial: async (subModuleId: string, body: UpdateMaterialRequest) =>
    (await apiFetch(`/admin/sub-modules/${subModuleId}/material`, { method: 'PATCH', body, schema: MaterialUpdatedResponseSchema })).data,

  changeStatus: async (entity: StatusEntity, entityId: string, body: ChangeStatusRequest) =>
    (await apiFetch(`/admin/${entity}/${entityId}/status`, { method: 'POST', body, schema: ChangeStatusResponseSchema })).data,

  sets: (p: SetListParams, signal?: AbortSignal) => apiFetch('/admin/assessment-sets', { query: p, schema: SetListResponseSchema, signal }),
  set: async (setId: string, signal?: AbortSignal) =>
    (await apiFetch(`/admin/assessment-sets/${setId}`, { schema: SetDetailResponseSchema, signal })).data,
  updateSet: async (setId: string, body: UpdateSetRequest) =>
    (await apiFetch(`/admin/assessment-sets/${setId}`, { method: 'PATCH', body, schema: SetUpdatedResponseSchema })).data,
  updateQuestion: async (setId: string, questionId: string, body: UpdateQuestionRequest) =>
    (
      await apiFetch(`/admin/assessment-sets/${setId}/questions/${encodeURIComponent(questionId)}`, {
        method: 'PATCH',
        body,
        schema: QuestionUpdatedResponseSchema,
      })
    ).data,
  quality: async (setId: string, signal?: AbortSignal) =>
    (await apiFetch(`/admin/assessment-sets/${setId}/quality`, { schema: QualityResponseSchema, signal })).data,

  revisions: (p: { entity_type: RevisionEntityTypeValue; entity_id: string; page: number; page_size: number }, signal?: AbortSignal) =>
    apiFetch('/admin/content-revisions', { query: p, schema: RevisionListResponseSchema, signal }),
  revision: async (revisionId: string, signal?: AbortSignal) =>
    (await apiFetch(`/admin/content-revisions/${revisionId}`, { schema: RevisionDetailResponseSchema, signal })).data,
};
