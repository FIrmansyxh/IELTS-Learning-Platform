import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';

/** Skema Placement Test adaptif (SPEC-015). */
export const PlacementBlockedReasonSchema = z.enum(['ALREADY_COMPLETED', 'PROGRESS_EXISTS', 'NO_PLACEMENT_PUBLISHED', 'RESULT_PENDING_APPLY']);

export const PlacementStatusSchema = z.object({
  available: z.boolean(),
  blocked_reason: PlacementBlockedReasonSchema.nullable(),
  assessment_set_id: Uuid.nullable(),
  question_count: z.number().int().nullable(),
  time_limit_seconds: z.number().int().nullable(),
  completed_at: IsoDateTime.nullable(),
  active_attempt_id: Uuid.nullable(),
  pending_result: z.object({ attempt_id: Uuid, recommended_tier: z.number().int() }).nullable(),
});
export type PlacementStatusType = z.infer<typeof PlacementStatusSchema>;
export const PlacementStatusResponseSchema = z.object({ data: PlacementStatusSchema });

export const ApplyPlacementRequestSchema = z.strictObject({
  attempt_id: Uuid,
  tier_number: z.number().int().min(1).max(4),
});
export type ApplyPlacementRequest = z.infer<typeof ApplyPlacementRequestSchema>;

export const ApplyPlacementResponseSchema = z.object({
  data: z.object({
    applied: z.boolean(),
    tier_number: z.number().int(),
    skipped_tiers: z.array(z.number().int()),
    unlocked: z.array(z.object({ kind: z.string(), id: z.string(), label: z.string() })),
  }),
});

export const PlacementResultSchema = z.object({
  recommended_tier: z.number().int().min(1).max(4),
  ability: z.number(),
  correct_count: z.number().int(),
  served_count: z.number().int(),
  applied: z.boolean(),
  tier_options: z.array(
    z.object({ tier_number: z.number().int(), title: z.string(), cefr_level: z.string(), target_band_min: z.number(), target_band_max: z.number() }),
  ),
});
