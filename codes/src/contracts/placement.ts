import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';

export const PlacementBlockedReason = z.enum([
  'ALREADY_COMPLETED',
  'PROGRESS_EXISTS',
  'NO_PLACEMENT_PUBLISHED',
  'RESULT_PENDING_APPLY',
]);
export type PlacementBlockedReasonType = z.infer<typeof PlacementBlockedReason>;

export const PlacementStatusSchema = z.object({
  available: z.boolean(),
  blocked_reason: PlacementBlockedReason.nullable(),
  assessment_set_id: Uuid.nullable(),
  question_count: z.number().int(),
  time_limit_seconds: z.number().int(),
  completed_at: IsoDateTime.nullable(),
  active_attempt_id: Uuid.nullable(),
  pending_result: z
    .object({
      attempt_id: Uuid,
      recommended_tier: z.number().int(),
    })
    .nullable(),
});
export type PlacementStatusDTO = z.infer<typeof PlacementStatusSchema>;
export const PlacementStatusResponseSchema = z.object({ data: PlacementStatusSchema });

export const PlacementTierOptionSchema = z.object({
  tier_number: z.number().int(),
  title: z.string(),
  cefr_level: z.string(),
  target_band_min: z.number(),
  target_band_max: z.number(),
});
export type PlacementTierOptionDTO = z.infer<typeof PlacementTierOptionSchema>;

export const PlacementResultSchema = z.object({
  recommended_tier: z.number().int(),
  ability: z.number(),
  correct_count: z.number().int(),
  served_count: z.number().int(),
  applied: z.boolean(),
  tier_options: z.array(PlacementTierOptionSchema),
});
export type PlacementResultDTO = z.infer<typeof PlacementResultSchema>;

export const ApplyPlacementRequestSchema = z.strictObject({
  attempt_id: Uuid,
  tier_number: z.number().int().min(1).max(4),
});
export type ApplyPlacementRequest = z.infer<typeof ApplyPlacementRequestSchema>;

export const ApplyPlacementResponseSchema = z.object({
  data: z.object({
    applied: z.literal(true),
    tier_number: z.number().int(),
    skipped_tiers: z.array(z.number().int()),
    unlocked: z.array(z.object({ kind: z.string(), id: Uuid, label: z.string() })),
  }),
});
export type ApplyPlacementResponse = z.infer<typeof ApplyPlacementResponseSchema>;

