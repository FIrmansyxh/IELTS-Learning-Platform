import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';

export const SkillCategoryEnum = z.enum([
  'LISTENING',
  'READING',
  'WRITING',
  'SPEAKING',
  'GRAMMAR',
  'VOCAB',
]);
export type SkillCategoryName = z.infer<typeof SkillCategoryEnum>;

export const SkillRadarItemSchema = z.object({
  skill: SkillCategoryEnum,
  score_percent: z.number().nullable(),
  estimated_band: z.number().nullable(),
  sample_size: z.number().int(),
  is_proxy: z.boolean(),
  updated_at: IsoDateTime.nullable(),
});
export type SkillRadarItemDTO = z.infer<typeof SkillRadarItemSchema>;

export const PredictionComponentsSchema = z.object({
  LISTENING: z.number().nullable(),
  READING: z.number().nullable(),
  WRITING: z.number().nullable(),
  SPEAKING: z.number().nullable(),
});
export type PredictionComponentsDTO = z.infer<typeof PredictionComponentsSchema>;

export const BandPredictionSchema = z.object({
  overall_band: z.number().nullable(),
  indicative_band: z.number().nullable(),
  range_low: z.number().nullable(),
  range_high: z.number().nullable(),
  complete: z.boolean(),
  components: PredictionComponentsSchema,
  basis_note: z.string(),
});
export type BandPredictionDTO = z.infer<typeof BandPredictionSchema>;

export const RadarDataSchema = z.object({
  skills: z.array(SkillRadarItemSchema).length(6),
  target_band: z.number().nullable(),
  prediction: BandPredictionSchema,
  disclaimer: z.string(),
});
export type RadarDataDTO = z.infer<typeof RadarDataSchema>;

export const RadarResponseSchema = z.object({
  data: RadarDataSchema,
});
export type RadarResponse = z.infer<typeof RadarResponseSchema>;

export const BandPredictionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export type BandPredictionsQuery = z.infer<typeof BandPredictionsQuerySchema>;

export const BandPredictionItemSchema = z.object({
  id: Uuid,
  overall_band: z.number(),
  components: PredictionComponentsSchema,
  trigger: z.enum(['BOSS', 'RECALC']),
  attempt_id: Uuid.nullable(),
  created_at: IsoDateTime,
});
export type BandPredictionItemDTO = z.infer<typeof BandPredictionItemSchema>;

export const BandPredictionsResponseSchema = z.object({
  data: z.array(BandPredictionItemSchema),
  meta: z.object({
    page: z.number().int(),
    page_size: z.number().int(),
    total: z.number().int(),
  }),
});
export type BandPredictionsResponse = z.infer<typeof BandPredictionsResponseSchema>;

export const ExamHistoryAssessmentType = z.enum([
  'SKIP_MODULE_TEST',
  'SKIP_TIER_TEST',
  'TIER_BOSS_EXAM',
  'PLACEMENT_TEST',
]);
export type ExamHistoryAssessmentTypeName = z.infer<typeof ExamHistoryAssessmentType>;

export const ExamHistoryQuerySchema = z.object({
  assessment_type: ExamHistoryAssessmentType.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export type ExamHistoryQuery = z.infer<typeof ExamHistoryQuerySchema>;

export const ExamHistoryItemSchema = z.object({
  attempt_id: Uuid,
  assessment_type: z.string(),
  title: z.string(),
  status: z.string(),
  score_percent: z.number().nullable(),
  band_score: z.number().nullable(),
  passed: z.boolean().nullable(),
  submitted_at: IsoDateTime.nullable(),
  result_path: z.string(),
});
export type ExamHistoryItemDTO = z.infer<typeof ExamHistoryItemSchema>;

export const ExamHistoryResponseSchema = z.object({
  data: z.array(ExamHistoryItemSchema),
  meta: z.object({
    page: z.number().int(),
    page_size: z.number().int(),
    total: z.number().int(),
  }),
});
export type ExamHistoryResponse = z.infer<typeof ExamHistoryResponseSchema>;

