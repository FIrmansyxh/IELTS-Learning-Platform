import { z } from 'zod';
import { Band, IsoDateTime, Uuid } from './common';

export const SubmissionKind = z.enum([
  'WRITING_TASK1',
  'WRITING_TASK2',
  'MINI_TASK_WRITING',
  'SPEAKING_PART1',
  'SPEAKING_PART2',
  'SPEAKING_PART3',
]);
export type SubmissionKindName = z.infer<typeof SubmissionKind>;

export const SubmissionStatus = z.enum([
  'RECEIVED',
  'TRANSCRIBING',
  'GRADING',
  'GRADED',
  'FALLBACK_SELF_ASSESSMENT',
  'FAILED',
]);
export type SubmissionStatusName = z.infer<typeof SubmissionStatus>;

export const AsyncJobKind = z.enum([
  'GRADE_WRITING',
  'GRADE_SPEAKING',
  'STT_TRANSCRIBE',
  'IMPORT_VALIDATE',
  'IMPORT_PUBLISH',
]);
export type AsyncJobKindName = z.infer<typeof AsyncJobKind>;

export const AsyncJobStatus = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);
export type AsyncJobStatusName = z.infer<typeof AsyncJobStatus>;

export const JobSchema = z.object({
  id: Uuid,
  kind: AsyncJobKind,
  status: AsyncJobStatus,
  stage: z.enum(['TRANSCRIBING', 'GRADING', 'SAVING']).nullable(),
  progress_percent: z.number().int().min(0).max(100),
  queue_position: z.number().int().nullable(),
  error_code: z.string().nullable(),
  attempt: z.number().int(),
});
export type JobDTO = z.infer<typeof JobSchema>;

export const EvaluationCriteriaSchema = z.object({
  key: z.string(),
  name: z.string(),
  band: Band,
  comment_id: z.string().nullable(),
});
export type EvaluationCriteriaDTO = z.infer<typeof EvaluationCriteriaSchema>;

export const EvaluationCorrectionSchema = z.object({
  original: z.string(),
  improved: z.string(),
  reason_id: z.string(),
});
export type EvaluationCorrectionDTO = z.infer<typeof EvaluationCorrectionSchema>;

export const EvaluationFlagsSchema = z.object({
  injection_suspected: z.boolean(),
  score_capped: z.boolean(),
  cap_reason: z.enum(['word_count', 'non_english', 'duration']).nullable(),
  high_band_capped: z.boolean(),
  non_english_suspected: z.boolean(),
  overall_recomputed: z.boolean(),
  pronunciation_estimated: z.boolean(),
  low_audio_quality: z.boolean(),
});
export type EvaluationFlagsDTO = z.infer<typeof EvaluationFlagsSchema>;

export const EvaluationSchema = z.object({
  id: Uuid,
  run_number: z.number().int(),
  method: z.enum(['AI_LOCAL', 'SELF_ASSESSMENT']),
  overall_band: Band,
  criteria: z.array(EvaluationCriteriaSchema),
  strengths_id: z.array(z.string()),
  improvements_id: z.array(z.string()),
  corrections: z.array(EvaluationCorrectionSchema),
  band7_rewrite: z.string().nullable(),
  task_requirement_met: z.boolean().nullable(),
  flags: EvaluationFlagsSchema,
  model_name: z.string().nullable(),
  disclaimer: z.string(),
  created_at: IsoDateTime,
});
export type EvaluationDTO = z.infer<typeof EvaluationSchema>;

export const RecordingSchema = z.object({
  id: Uuid,
  mime_type: z.enum(['audio/webm', 'audio/ogg', 'audio/mp4']),
  size_bytes: z.number().int(),
  duration_ms: z.number().int().nullable(),
  transcript: z.string().nullable(),
  stt_confidence: z.number().nullable(),
  available: z.boolean(),
  retention_expires_at: IsoDateTime.nullable(),
  purged_at: IsoDateTime.nullable(),
});
export type RecordingDTO = z.infer<typeof RecordingSchema>;

export const SubmissionSchema = z.object({
  id: Uuid,
  kind: SubmissionKind,
  status: SubmissionStatus,
  attempt_id: Uuid.nullable(),
  sub_module_id: Uuid.nullable(),
  question_id: z.string().nullable(),
  prompt_snapshot: z.string(),
  response_text: z.string().nullable(),
  word_count: z.number().int().nullable(),
  duration_sec: z.number().int().nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  job: JobSchema.nullable(),
  evaluation: EvaluationSchema.nullable(),
  recording: RecordingSchema.nullable(),
});
export type SubmissionDTO = z.infer<typeof SubmissionSchema>;

export const SubmissionQuotaSchema = z.object({
  limit: z.number().int(),
  used: z.number().int(),
  remaining: z.number().int(),
  resets_at: IsoDateTime.nullable(),
});
export type SubmissionQuotaDTO = z.infer<typeof SubmissionQuotaSchema>;

export const CreateWritingSubmissionRequestSchema = z.strictObject({
  kind: z.enum(['WRITING_TASK1', 'WRITING_TASK2', 'MINI_TASK_WRITING']),
  attempt_id: Uuid.optional(),
  question_id: z.string().min(1).max(40).optional(),
  sub_module_id: Uuid.optional(),
  response_text: z.string().min(1).max(5000),
  duration_sec: z.number().int().min(0).max(7200).optional(),
});
export type CreateWritingSubmissionRequest = z.infer<typeof CreateWritingSubmissionRequestSchema>;

export const SelfAssessmentRequestSchema = z.strictObject({
  criteria_scores: z.record(z.string(), Band),
});
export type SelfAssessmentRequest = z.infer<typeof SelfAssessmentRequestSchema>;

const bandNum = z
  .number()
  .min(0)
  .max(9)
  .refine((v) => Number.isInteger(v * 2), 'band harus kelipatan 0.5');

const criterionOutput = z.strictObject({
  band: bandNum,
  comment_id: z.string().min(1).max(400),
});

export const WritingEvaluationOutputSchema = z.strictObject({
  criteria: z.strictObject({
    task_response: criterionOutput,
    coherence: criterionOutput,
    lexical: criterionOutput,
    grammar: criterionOutput,
  }),
  overall_band: bandNum,
  task_requirement_met: z.boolean(),
  strengths_id: z.array(z.string().max(300)).min(1).max(4),
  improvements_id: z.array(z.string().max(300)).min(1).max(5),
  corrections: z
    .array(
      z.strictObject({
        original: z.string().max(300),
        improved: z.string().max(300),
        reason_id: z.string().max(300),
      }),
    )
    .max(8),
  band7_rewrite: z.string().max(1500),
});
export type WritingEvaluationOutput = z.infer<typeof WritingEvaluationOutputSchema>;

export const SpeakingEvaluationOutputSchema = z.strictObject({
  criteria: z.strictObject({
    fluency: criterionOutput,
    lexical: criterionOutput,
    grammar: criterionOutput,
    pronunciation: criterionOutput,
  }),
  overall_band: bandNum,
  task_requirement_met: z.boolean(),
  strengths_id: z.array(z.string().max(300)).min(1).max(4),
  improvements_id: z.array(z.string().max(300)).min(1).max(5),
  corrections: z
    .array(
      z.strictObject({
        original: z.string().max(300),
        improved: z.string().max(300),
        reason_id: z.string().max(300),
      }),
    )
    .max(8),
  band7_rewrite: z.string().max(1500),
});
export type SpeakingEvaluationOutput = z.infer<typeof SpeakingEvaluationOutputSchema>;

export const RecordingPreferencesRequestSchema = z.strictObject({
  keep_recordings: z.boolean(),
});
export type RecordingPreferencesRequest = z.infer<typeof RecordingPreferencesRequestSchema>;

export const AiStatusSchema = z.object({
  enabled: z.boolean(),
  available: z.boolean(),
  queue: z.object({
    waiting: z.number().int(),
    estimated_wait_sec: z.number().int().nullable(),
  }),
  quota: SubmissionQuotaSchema,
  recording_retention_days: z.number().int(),
});
export type AiStatusDTO = z.infer<typeof AiStatusSchema>;

export const SubmissionsListQuerySchema = z.object({
  kind: SubmissionKind.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20),
});
export type SubmissionsListQuery = z.infer<typeof SubmissionsListQuerySchema>;

export const SubmissionListItemSchema = z.object({
  id: Uuid,
  kind: SubmissionKind,
  status: SubmissionStatus,
  overall_band: Band.nullable(),
  method: z.enum(['AI_LOCAL', 'SELF_ASSESSMENT']).nullable(),
  word_count: z.number().int().nullable(),
  prompt_excerpt: z.string(),
  created_at: IsoDateTime,
});
export type SubmissionListItemDTO = z.infer<typeof SubmissionListItemSchema>;
