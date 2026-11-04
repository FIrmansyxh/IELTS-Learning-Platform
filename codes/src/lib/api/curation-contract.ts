import type { z } from 'zod';
import {
  BlockerSchema,
  ContentOrigin,
  CurriculumResponseSchema,
  QualityResponseSchema,
  RevisionDetailResponseSchema,
  RevisionListQuerySchema,
  RevisionListResponseSchema,
  SetDetailResponseSchema,
  SetRefSchema,
  SetSummarySchema,
  SubModuleDetailResponseSchema,
  type UpdateAssessmentSetRequestSchema,
  type UpdateMaterialRequestSchema,
  type UpdateModuleRequestSchema,
  type UpdateSubModuleRequestSchema,
  type ChangeStatusRequestSchema,
} from '@/contracts/curation';
import type { ReviewStatus } from '@/contracts/common';

/**
 * Kontrak SPEC-020 di sisi klien: SELURUH skema respons berasal dari `src/contracts/curation.ts` (satu sumber dengan server).
 * Modul ini hanya me-re-export skema dan menurunkan tipe; tidak ada duplikasi skema (F-20-13).
 */
export * from '@/contracts/curation';

export type ReviewStatusValue = z.infer<typeof ReviewStatus>;
export type SetRef = z.infer<typeof SetRefSchema>;
export type Blocker = z.infer<typeof BlockerSchema>;
export type ContentOriginValue = z.infer<typeof ContentOrigin>;
export type CurriculumTier = z.infer<typeof CurriculumResponseSchema>['data']['tiers'][number];
export type CurriculumModule = CurriculumTier['modules'][number];
export type CurriculumSubModule = CurriculumModule['sub_modules'][number];
export type SubModuleDetail = z.infer<typeof SubModuleDetailResponseSchema>['data'];
export type SubModuleMaterial = NonNullable<SubModuleDetail['material']>;
export type MiniTask = NonNullable<SubModuleMaterial['mini_task']>;
export type SetSummary = z.infer<typeof SetSummarySchema>;
export type QualityRow = z.infer<typeof QualityResponseSchema>['data']['questions'][number];
export type Revision = z.infer<typeof RevisionListResponseSchema>['data'][number];
export type RevisionDetail = z.infer<typeof RevisionDetailResponseSchema>['data'];

/** Kunci jawaban dibaca longgar (server mengirim `looseObject`); field per tipe soal bersifat opsional. */
type QuestionExtras = {
  explanation_id?: string | null;
  points?: number;
  target_time_ms?: number | null;
  difficulty?: number | null;
  passage_no?: number | null;
  section_no?: number | null;
  options?: string[] | null;
  correct_answers?: Array<string | number> | null;
  max_words?: number | null;
  matching?: { left: string[]; right: string[]; allow_reuse?: boolean } | null;
  segments?: string[] | null;
  tokens?: string[] | null;
};
export type SetDetail = z.infer<typeof SetDetailResponseSchema>['data'];
export type AdminQuestion = SetDetail['questions'][number] & QuestionExtras;

/** Nilai enum untuk filter/daftar pilihan di UI (tipe set dan jenis entitas revisi). */
export const AssessmentSetType = SetSummarySchema.shape.assessment_type;
export const RevisionEntityType = RevisionListQuerySchema.shape.entity_type;
export type RevisionEntityTypeValue = z.infer<typeof RevisionEntityType>;

export type UpdateModuleRequest = z.input<typeof UpdateModuleRequestSchema>;
export type UpdateSubModuleRequest = z.input<typeof UpdateSubModuleRequestSchema>;
export type UpdateMaterialRequest = z.input<typeof UpdateMaterialRequestSchema>;
export type UpdateSetRequest = z.input<typeof UpdateAssessmentSetRequestSchema>;
/** Dibangun dinamis per tipe soal; server memvalidasi dengan `UpdateQuestionRequestSchema` (strict). */
export type UpdateQuestionRequest = Record<string, unknown>;
export type ChangeStatusRequest = z.input<typeof ChangeStatusRequestSchema>;
