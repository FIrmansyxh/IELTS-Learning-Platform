import { z } from 'zod';
import { Band, EvaluationFlagsDTO, IsoDateTime, JobDTO, PageMetaSchema, QuotaDTO, UserDTO, Uuid } from '@/contracts/common';

/**
 * Skema respons AI (SPEC-012/013) di sisi klien, persis mengikuti `specifications/012_spec_ai_writing.md`
 * dan `013_spec_ai_speaking.md`. Modul bersama `src/contracts/ai.ts` belum ada saat TASK-012/013 sisi
 * Frontend dikerjakan; bila Backend membuatnya, impor di `ai.ts` cukup dialihkan ke sana (tanpa mengubah
 * bentuk). Drift TIDAK ditambal di klien: respons yang tidak cocok melempar `RESPONSE_INVALID`.
 */
export const SubmissionKind = z.enum([
  'WRITING_TASK1',
  'WRITING_TASK2',
  'MINI_TASK_WRITING',
  'SPEAKING_PART1',
  'SPEAKING_PART2',
  'SPEAKING_PART3',
  'MINI_TASK_SPEAKING',
]);
export type SubmissionKindType = z.infer<typeof SubmissionKind>;

export const SubmissionStatus = z.enum(['RECEIVED', 'TRANSCRIBING', 'GRADING', 'GRADED', 'FALLBACK_SELF_ASSESSMENT', 'FAILED']);
export type SubmissionStatusType = z.infer<typeof SubmissionStatus>;

export const EvaluationDTO = z.strictObject({
  id: Uuid,
  run_number: z.number().int(),
  method: z.enum(['AI_LOCAL', 'SELF_ASSESSMENT']),
  overall_band: Band,
  criteria: z.array(
    z.strictObject({ key: z.string(), name: z.string(), band: Band, comment_id: z.string().nullable() }),
  ),
  strengths_id: z.array(z.string()),
  improvements_id: z.array(z.string()),
  corrections: z.array(z.strictObject({ original: z.string(), improved: z.string(), reason_id: z.string() })),
  band7_rewrite: z.string().nullable(),
  task_requirement_met: z.boolean().nullable(),
  flags: EvaluationFlagsDTO,
  model_name: z.string().nullable(),
  disclaimer: z.string(),
  created_at: IsoDateTime,
});
export type Evaluation = z.infer<typeof EvaluationDTO>;

export const RecordingDTO = z.strictObject({
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
export type Recording = z.infer<typeof RecordingDTO>;

export const SubmissionDTO = z.strictObject({
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
  job: JobDTO.nullable(),
  evaluation: EvaluationDTO.nullable(),
  recording: RecordingDTO.nullable(),
});
export type Submission = z.infer<typeof SubmissionDTO>;
export type Job = z.infer<typeof JobDTO>;
export type Quota = z.infer<typeof QuotaDTO>;

export const CreateSubmissionResponseSchema = z.strictObject({
  data: z.strictObject({ submission: SubmissionDTO, quota: QuotaDTO }),
});
export const SubmissionResponseSchema = z.strictObject({ data: z.strictObject({ submission: SubmissionDTO }) });
export const RetryResponseSchema = CreateSubmissionResponseSchema;
export const SelfAssessmentResponseSchema = z.strictObject({
  data: z.strictObject({ submission: SubmissionDTO, evaluation: EvaluationDTO }),
});

export const SubmissionListItemDTO = z.strictObject({
  id: Uuid,
  kind: SubmissionKind,
  status: SubmissionStatus,
  overall_band: Band.nullable(),
  method: z.enum(['AI_LOCAL', 'SELF_ASSESSMENT']).nullable(),
  word_count: z.number().int().nullable(),
  prompt_excerpt: z.string(),
  created_at: IsoDateTime,
});
export type SubmissionListItem = z.infer<typeof SubmissionListItemDTO>;
export const SubmissionListResponseSchema = z.strictObject({
  data: z.array(SubmissionListItemDTO),
  meta: PageMetaSchema,
});

export const AiStatusResponseSchema = z.strictObject({
  data: z.strictObject({
    enabled: z.boolean(),
    available: z.boolean(),
    queue: z.strictObject({ waiting: z.number().int(), estimated_wait_sec: z.number().nullable() }),
    quota: QuotaDTO,
    recording_retention_days: z.number().int(),
  }),
});
export type AiStatus = z.infer<typeof AiStatusResponseSchema>['data'];

export const UserEnvelopeSchema = z.strictObject({ data: z.strictObject({ user: UserDTO }) });

export const WRITING_CRITERIA = ['task_response', 'coherence', 'lexical', 'grammar'] as const;
export const SPEAKING_CRITERIA = ['fluency', 'lexical', 'grammar', 'pronunciation'] as const;
export type CriteriaScores = Record<string, number>;

export const isSpeakingKind = (k: SubmissionKindType) => k.includes('SPEAKING');
