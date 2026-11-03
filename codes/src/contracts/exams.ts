import { z } from 'zod';
import { AssessmentType, IsoDateTime, Uuid } from './common';

/** Skema intro ujian generik dan ekstensi hasil Skip (SPEC-008). Klien longgar terhadap kunci tambahan. */
export const ExamBlockedReason = z.enum(['SKIP_NOT_AVAILABLE', 'COOLDOWN_ACTIVE', 'DAILY_ATTEMPT_LIMIT']);

export const ExamIntroSchema = z.object({
  assessment_set_id: Uuid,
  assessment_type: AssessmentType,
  title: z.string(),
  scope: z.object({ kind: z.enum(['MODULE', 'TIER']), id: Uuid, label: z.string() }).nullable(),
  time_limit_seconds: z.number().int(),
  question_count: z.number().int(),
  threshold: z.object({ kind: z.string(), value: z.number() }).nullable(),
  rules: z.array(z.string()),
  available: z.boolean(),
  blocked_reason: ExamBlockedReason.nullable(),
  cooldown: z.object({
    next_allowed_at: IsoDateTime.nullable(),
    attempts_in_window: z.number().int(),
    max_attempts: z.number().int(),
  }),
  active_attempt_id: Uuid.nullable(),
  requires_audio: z.boolean(),
  requires_microphone: z.boolean(),
  boss: z.unknown().nullable().optional(),
  placement: z.unknown().nullable().optional(),
});
export type ExamIntro = z.infer<typeof ExamIntroSchema>;
export const ExamIntroResponseSchema = z.object({ data: ExamIntroSchema });

export const SkipResultSchema = z.object({
  passed: z.boolean(),
  score_percent: z.number(),
  threshold_percent: z.number(),
  scope: z.object({ kind: z.enum(['MODULE', 'TIER']), id: Uuid, label: z.string() }),
  skipped_sub_module_count: z.number().int(),
  unlocked: z.array(z.object({ kind: z.string(), id: z.string(), label: z.string() })),
  retry: z.object({ next_allowed_at: IsoDateTime.nullable(), attempts_remaining_today: z.number().int() }),
});
export type SkipResult = z.infer<typeof SkipResultSchema>;
