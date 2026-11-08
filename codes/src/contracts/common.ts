import { z } from 'zod';

/** DTO bersama (specifications/_api-contract.md bagian 4). Dipakai server dan klien. */
export const Uuid = z.uuid();
export const IsoDateTime = z.iso.datetime();
export const Band = z.number().min(0).max(9).multipleOf(0.5);
export const SkillCategory = z.enum(['GRAMMAR', 'VOCAB', 'LISTENING', 'READING', 'WRITING', 'SPEAKING']);
export const ProgressStatus = z.enum(['LOCKED', 'UNLOCKED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED']);
export const ReviewStatus = z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED']);
export const AssessmentType = z.enum([
  'ACTIVE_DRILL',
  'SKIP_MODULE_TEST',
  'SKIP_TIER_TEST',
  'TIER_BOSS_EXAM',
  'PLACEMENT_TEST',
  'BOSS_SECTION',
  // SPEC-022 (didaftarkan sekali di sini; MOCK_TEST dan TRACK_CHECKPOINT dipakai SPEC-023/021)
  'QUESTION_BANK',
  'MIX_PRACTICE',
  'MOCK_TEST',
  'TRACK_CHECKPOINT',
]);

export const ErrorBodySchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    request_id: Uuid,
    details: z.array(z.strictObject({ path: z.string(), code: z.string(), message: z.string() })).optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

export const PageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export const PageMetaSchema = z.strictObject({
  page: z.number().int(),
  page_size: z.number().int(),
  total: z.number().int(),
});

export const UserDTO = z.strictObject({
  id: Uuid,
  display_name: z.string(),
  target_band: Band.nullable(),
  consent_recording_at: IsoDateTime.nullable(),
  keep_recordings: z.boolean(),
  placement_completed_at: IsoDateTime.nullable(),
});
export type UserDTOType = z.infer<typeof UserDTO>;

export const JobDTO = z.strictObject({
  id: Uuid,
  kind: z.enum(['GRADE_WRITING', 'GRADE_SPEAKING', 'STT_TRANSCRIBE']),
  status: z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']),
  stage: z.enum(['TRANSCRIBING', 'GRADING', 'SAVING']).nullable(),
  progress_percent: z.number().int().min(0).max(100),
  queue_position: z.number().int().nullable(),
  error_code: z.string().nullable(),
  attempt: z.number().int(),
});

export const QuotaDTO = z.strictObject({
  limit: z.number().int(),
  used: z.number().int(),
  remaining: z.number().int(),
  resets_at: IsoDateTime.nullable(),
});

export const EvaluationFlagsDTO = z.strictObject({
  injection_suspected: z.boolean(),
  score_capped: z.boolean(),
  cap_reason: z.enum(['word_count', 'non_english', 'duration']).nullable(),
  high_band_capped: z.boolean(),
  non_english_suspected: z.boolean(),
  overall_recomputed: z.boolean(),
  pronunciation_estimated: z.boolean(),
  low_audio_quality: z.boolean(),
});
