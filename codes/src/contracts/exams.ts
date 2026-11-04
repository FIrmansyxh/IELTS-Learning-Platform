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

// ---------------------------------------------------------------- SPEC-014 / SPEC-015 (aditif)
/** Intro ujian lengkap: memperlebar `scope`/`blocked_reason` untuk Boss dan Placement. `ExamIntroSchema` (Skip) tidak berubah. */
export const ExamIntroFullSchema = ExamIntroSchema.extend({
  scope: z.object({ kind: z.enum(['MODULE', 'TIER', 'TIER_PLACEMENT']), id: Uuid.nullable(), label: z.string() }).nullable(),
  blocked_reason: z
    .enum([
      'SKIP_NOT_AVAILABLE',
      'COOLDOWN_ACTIVE',
      'DAILY_ATTEMPT_LIMIT',
      'TIER_LOCKED',
      'MODULES_INCOMPLETE',
      'BOSS_ALREADY_PASSED',
      'ALREADY_COMPLETED',
      'PROGRESS_EXISTS',
      'RESULT_PENDING_APPLY',
    ])
    .nullable(),
});
export type ExamIntroFull = z.infer<typeof ExamIntroFullSchema>;

export const BossSkillSchema = z.enum(['LISTENING', 'READING', 'WRITING', 'SPEAKING']);
export const SectionDTOSchema = z.object({
  assessment_set_id: Uuid,
  skill: BossSkillSchema,
  order: z.number().int().min(1).max(4),
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
export type SectionDTOType = z.infer<typeof SectionDTOSchema>;

export const SectionParamsSchema = z.strictObject({ attempt_id: Uuid, section_set_id: Uuid });

export const BossGateSchema = z.object({ type: z.enum(['PERCENT', 'BAND']), value: z.number() });
export const BossResultSchema = z.object({
  passed: z.boolean(),
  gate: BossGateSchema,
  percent: z.number(),
  boss_band: z.number(),
  sections: z.array(
    z.object({
      skill: BossSkillSchema,
      raw_score: z.number().nullable(),
      max_score: z.number().nullable(),
      raw_40: z.number().nullable(),
      band: z.number().nullable(),
      status: z.enum(['IN_PROGRESS', 'SUBMITTED', 'GRADED', 'EXPIRED', 'ABANDONED']),
      /** Urut created_at naik (tidak berubah). Untuk tautan umpan balik pakai `graded_submission_id`/`latest_submission_id`. */
      submission_ids: z.array(Uuid),
      /** Aditif (QA F-14-08/09). Submission W/S terbaru; null untuk Listening/Reading atau belum ada. */
      latest_submission_id: Uuid.nullable().optional(),
      /** Submission sumber `band` (evaluasi AI_LOCAL bernilai terbaru); null bila band null. */
      graded_submission_id: Uuid.nullable().optional(),
      /** Status AI per section W/S; null untuk Listening/Reading. */
      ai_status: z.enum(['NOT_SUBMITTED', 'PENDING', 'GRADED', 'NO_BAND']).nullable().optional(),
      counts_toward_gate: z.boolean(),
    }),
  ),
  overall_band_estimate: z.number().nullable(),
  pending_ai: z.number().int(),
  band_table_ids: z.object({ listening: Uuid, reading_academic: Uuid }),
  tier: z.object({ id: Uuid, tier_number: z.number().int() }),
  next_tier_unlocked: z.boolean(),
  unlocked: z.array(z.object({ kind: z.string(), id: z.string(), label: z.string() })),
  retry: z.object({ next_allowed_at: IsoDateTime.nullable(), attempts_remaining_today: z.number().int() }),
  disclaimer: z.string(),
});
export type BossResultType = z.infer<typeof BossResultSchema>;
