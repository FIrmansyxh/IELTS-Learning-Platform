import { z } from 'zod';
import { AssessmentType, IsoDateTime, Uuid } from './common';
import { QuestionPublicSchema } from './attempts';

/** Skema intro ujian generik dan ekstensi hasil Skip & Boss (SPEC-008, SPEC-014). */
export const ExamBlockedReason = z.enum([
  'SKIP_NOT_AVAILABLE',
  'COOLDOWN_ACTIVE',
  'DAILY_ATTEMPT_LIMIT',
  'TIER_LOCKED',
  'MODULES_INCOMPLETE',
  'BOSS_ALREADY_PASSED',
  'ALREADY_COMPLETED',
  'PROGRESS_EXISTS',
  'NO_PLACEMENT_PUBLISHED',
  'RESULT_PENDING_APPLY',
]);
export type ExamBlockedReasonType = z.infer<typeof ExamBlockedReason>;

export const SectionDTOSchema = z.object({
  assessment_set_id: Uuid,
  skill: z.enum(['LISTENING', 'READING', 'WRITING', 'SPEAKING']),
  order: z.number().int(),
  title: z.string(),
  time_limit_seconds: z.number().int(),
  question_count: z.number().int(),
  counts_toward_gate: z.boolean(),
  requires_audio: z.boolean(),
  requires_microphone: z.boolean(),
  phase: z.enum(['PENDING', 'ACTIVE', 'DONE']),
  started_at: IsoDateTime.nullable(),
  deadline_at: IsoDateTime.nullable(),
  remaining_seconds: z.number().int().nullable(),
});
export type SectionDTO = z.infer<typeof SectionDTOSchema>;

export const BossSectionStartSchema = z.object({
  section: SectionDTOSchema,
  passage_markdown: z.string().nullable(),
  listening: z
    .object({
      audio_url: z.string(),
      mime_type: z.string(),
      duration_sec: z.number().int(),
    })
    .nullable(),
  questions: z.array(QuestionPublicSchema),
  answers: z.array(
    z.object({
      question_id: z.string(),
      response: z.record(z.string(), z.unknown()),
    }),
  ),
  server_now: IsoDateTime,
});
export type BossSectionStartDTO = z.infer<typeof BossSectionStartSchema>;
export const BossSectionStartResponseSchema = z.object({ data: BossSectionStartSchema });

export const BossSectionSubmitSchema = z.object({
  section: SectionDTOSchema,
  next_section: SectionDTOSchema.nullable(),
});
export type BossSectionSubmitDTO = z.infer<typeof BossSectionSubmitSchema>;
export const BossSectionSubmitResponseSchema = z.object({ data: BossSectionSubmitSchema });

export const BossIntroSchema = z.object({
  tier_number: z.number().int(),
  gate: z.object({
    type: z.enum(['PERCENT', 'BAND']),
    value: z.number(),
  }),
  sections: z.array(SectionDTOSchema),
  total_time_limit_seconds: z.number().int(),
  last_result: z
    .object({
      passed: z.boolean(),
      score_percent: z.number(),
      boss_band: z.number(),
      at: IsoDateTime,
    })
    .nullable(),
  advisory_note: z.string(),
});
export type BossIntroDTO = z.infer<typeof BossIntroSchema>;

export const BossSectionResultSchema = z.object({
  skill: z.enum(['LISTENING', 'READING', 'WRITING', 'SPEAKING']),
  raw_score: z.number().nullable(),
  max_score: z.number().nullable(),
  raw_40: z.number().nullable(),
  band: z.number().nullable(),
  status: z.string(),
  submission_ids: z.array(Uuid),
  counts_toward_gate: z.boolean(),
});
export type BossSectionResultDTO = z.infer<typeof BossSectionResultSchema>;

export const BossResultSchema = z.object({
  passed: z.boolean(),
  gate: z.object({
    type: z.enum(['PERCENT', 'BAND']),
    value: z.number(),
  }),
  percent: z.number(),
  boss_band: z.number(),
  sections: z.array(BossSectionResultSchema),
  overall_band_estimate: z.number().nullable(),
  pending_ai: z.number().int(),
  band_table_ids: z.object({
    listening: Uuid,
    reading_academic: Uuid,
  }),
  tier: z.object({
    id: Uuid,
    tier_number: z.number().int(),
  }),
  next_tier_unlocked: z.boolean(),
  unlocked: z.array(z.object({ kind: z.string(), id: z.string(), label: z.string() })),
  retry: z.object({
    next_allowed_at: IsoDateTime.nullable(),
    attempts_remaining_today: z.number().int(),
  }),
  disclaimer: z.string(),
});
export type BossResultDTO = z.infer<typeof BossResultSchema>;

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
  boss: BossIntroSchema.nullable().optional(),
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
