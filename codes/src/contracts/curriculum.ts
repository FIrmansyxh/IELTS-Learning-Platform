import { z } from 'zod';
import { Band, IsoDateTime, ProgressStatus, SkillCategory, Uuid } from './common';
import { CheckpointInfoDTO, DeliveryStyleSchema, TrackItemKindSchema, TrackLayoutSchema } from './tracks';

/** Skema pohon kurikulum (SPEC-003). */
export const UnlockSource = z.enum(['DEFAULT', 'SEQUENTIAL', 'BOSS_PASS', 'SKIP_TEST', 'PLACEMENT', 'ADMIN']);
export const ContentState = z.enum(['AVAILABLE', 'COMING_SOON']);
export const MasteryCrown = z.enum(['NONE', 'SILVER', 'GOLD']);
export const BossBlockedReason = z.enum(['TIER_LOCKED', 'MODULES_INCOMPLETE', 'NO_BOSS_PUBLISHED', 'ALREADY_PASSED']);

export const SkipTestDTO = z.object({
  available: z.boolean(),
  assessment_set_id: Uuid.nullable(),
  threshold_percent: z.number(),
  time_limit_seconds: z.number().int().nullable(),
  question_count: z.number().int().nullable(),
});

export const BossDTO = z.object({
  available: z.boolean(),
  blocked_reason: BossBlockedReason.nullable(),
  gate_type: z.enum(['PERCENT', 'BAND']),
  gate_value: z.number(),
  assessment_set_id: Uuid.nullable(),
  best_percent: z.number().nullable(),
  best_band: Band.nullable(),
  passed_at: IsoDateTime.nullable(),
});

export const LockReasonDTO = z.object({
  code: z.enum(['TIER_LOCKED', 'PREVIOUS_INCOMPLETE', 'NOT_PUBLISHED']),
  blocking_sub_module_id: Uuid.nullable(),
  message: z.string(),
});

export const SubModuleNodeDTO = z.object({
  id: Uuid,
  sub_module_code: z.string(),
  title: z.string(),
  order_index: z.number().int(),
  status: ProgressStatus,
  content_state: ContentState,
  mastery_crown: MasteryCrown,
  best_score_percent: z.number(),
  progress_percent: z.number().int().min(0).max(100),
  has_mini_task: z.boolean(),
  lock_reason: LockReasonDTO.nullable(),
});

export const ModuleNodeDTO = z.object({
  id: Uuid,
  module_code: z.string(),
  skill_category: SkillCategory,
  title: z.string(),
  order_index: z.number().int(),
  status: ProgressStatus,
  content_state: ContentState,
  progress_percent: z.number().int().min(0).max(100),
  skip_test: SkipTestDTO,
  sub_modules: z.array(SubModuleNodeDTO),
});

export const TierNodeDTO = z.object({
  id: Uuid,
  tier_number: z.number().int().min(1).max(4),
  title: z.string(),
  cefr_level: z.string(),
  target_band_min: z.number(),
  target_band_max: z.number(),
  status: ProgressStatus,
  unlock_source: UnlockSource.nullable(),
  progress_percent: z.number().int().min(0).max(100),
  boss: BossDTO,
  skip_test: SkipTestDTO,
  modules: z.array(ModuleNodeDTO),
});

export const TrackItemDTO = z.object({
  position: z.number().int().min(1),
  kind: TrackItemKindSchema,
  item_id: Uuid.nullable(),
  sub_module: SubModuleNodeDTO.nullable(),
  week_no: z.number().int().nullable(),
  day_no: z.number().int().nullable(),
  checkpoint: CheckpointInfoDTO.nullable(),
});
export const TrackViewDTO = z.object({
  code: z.string(),
  title: z.string(),
  layout: TrackLayoutSchema,
  delivery_style_default: DeliveryStyleSchema,
  is_active: z.boolean(),
  items: z.array(TrackItemDTO),
});

export const CurriculumTreeResponseSchema = z.object({
  data: z.object({
    tiers: z.array(TierNodeDTO),
    track: TrackViewDTO.nullable().optional(),
  }),
});

export type CurriculumTree = z.infer<typeof CurriculumTreeResponseSchema>['data'];
export type TierNode = z.infer<typeof TierNodeDTO>;
export type ModuleNode = z.infer<typeof ModuleNodeDTO>;
export type SubModuleNode = z.infer<typeof SubModuleNodeDTO>;
export type TrackItem = z.infer<typeof TrackItemDTO>;
export type TrackView = z.infer<typeof TrackViewDTO>;
