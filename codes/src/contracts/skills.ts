import { z } from 'zod';
import { IsoDateTime, PageMetaSchema, PageQuerySchema, Uuid } from './common';

/** Skema Radar 6 Sumbu & Prediksi Band (SPEC-017). Semua data milik pemanggil; tidak ada parameter `user_id`. */
export const RadarSkill = z.enum(['LISTENING', 'READING', 'WRITING', 'SPEAKING', 'GRAMMAR', 'VOCAB']);
export type RadarSkillName = z.infer<typeof RadarSkill>;
/** Urutan tetap `skills[]` pada respons radar. */
export const RADAR_ORDER: readonly RadarSkillName[] = ['LISTENING', 'READING', 'WRITING', 'SPEAKING', 'GRAMMAR', 'VOCAB'];

const NullableBand = z.number().min(0).max(9).nullable();

export const SkillScoreSchema = z.object({
  skill: RadarSkill,
  score_percent: z.number().min(0).max(100).nullable(),
  estimated_band: NullableBand,
  sample_size: z.number().int().min(0),
  is_proxy: z.boolean(),
  updated_at: IsoDateTime.nullable(),
});
export type SkillScoreDTO = z.infer<typeof SkillScoreSchema>;

export const BandComponentsSchema = z.object({ LISTENING: NullableBand, READING: NullableBand, WRITING: NullableBand, SPEAKING: NullableBand });
export type BandComponents = z.infer<typeof BandComponentsSchema>;

export const PredictionSchema = z.object({
  overall_band: NullableBand,
  indicative_band: NullableBand,
  range_low: NullableBand,
  range_high: NullableBand,
  complete: z.boolean(),
  components: BandComponentsSchema,
  basis_note: z.string(),
  /** F-17-02 (aditif): sampel objektif terkecil di antara komponen Listening/Reading; null bila tidak ada. */
  sample_size: z.number().int().min(0).nullable().optional(),
  /** F-17-02 (aditif): true bila sampel < 30 (rentang +/-1,0 dan label "Indikatif"); FE menampilkan lencana. */
  low_sample: z.boolean().optional(),
});
export type PredictionDTO = z.infer<typeof PredictionSchema>;

export const RadarSchema = z.object({
  skills: z.array(SkillScoreSchema).length(6),
  target_band: NullableBand,
  prediction: PredictionSchema,
  disclaimer: z.string(),
});
export type RadarDTO = z.infer<typeof RadarSchema>;
export const RadarResponseSchema = z.object({ data: RadarSchema });

export const BandPredictionSchema = z.object({
  id: Uuid,
  overall_band: z.number().min(0).max(9),
  components: BandComponentsSchema,
  trigger: z.enum(['BOSS', 'RECALC']),
  attempt_id: Uuid.nullable(),
  created_at: IsoDateTime,
});
export const BandPredictionsResponseSchema = z.object({ data: z.array(BandPredictionSchema), meta: PageMetaSchema });
export const BandPredictionsQuerySchema = PageQuerySchema;

export const ExamHistoryType = z.enum(['SKIP_MODULE_TEST', 'SKIP_TIER_TEST', 'TIER_BOSS_EXAM', 'PLACEMENT_TEST']);
export const ExamHistoryQuerySchema = z.strictObject({
  assessment_type: ExamHistoryType.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export const ExamHistoryItemSchema = z.object({
  attempt_id: Uuid,
  assessment_type: ExamHistoryType,
  title: z.string(),
  status: z.enum(['GRADED', 'EXPIRED']),
  score_percent: z.number(),
  band_score: z.number().nullable(),
  passed: z.boolean().nullable(),
  submitted_at: IsoDateTime,
  /** Tautan internal saja (cegah open redirect). */
  result_path: z.string().refine((p) => p.startsWith('/') && !p.startsWith('//'), { message: 'invalid_path' }),
});
export const ExamHistoryResponseSchema = z.object({ data: z.array(ExamHistoryItemSchema), meta: PageMetaSchema });

export const DISCLAIMER = 'Perkiraan latihan, bukan skor resmi IELTS.';
