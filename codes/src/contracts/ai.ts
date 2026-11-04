import { z } from 'zod';
import { Band, EvaluationFlagsDTO, IsoDateTime, JobDTO, QuotaDTO, UserDTO, Uuid } from './common';

/**
 * Kontrak SPEC-012 (Writing) dan SPEC-013 (Speaking): permintaan, DTO, dan skema keluaran LLM.
 * Dipakai server dan klien. DTO TIDAK memuat `raw_output`, `prompt_version`, `error_code` evaluasi, atau email.
 */
export const DISCLAIMER = 'Perkiraan latihan, bukan skor resmi IELTS.';

export const SubmissionKind = z.enum([
  'WRITING_TASK1',
  'WRITING_TASK2',
  'MINI_TASK_WRITING',
  'SPEAKING_PART1',
  'SPEAKING_PART2',
  'SPEAKING_PART3',
  'MINI_TASK_SPEAKING',
]);
export type SubmissionKindName = z.infer<typeof SubmissionKind>;
export const SubmissionStatus = z.enum(['RECEIVED', 'TRANSCRIBING', 'GRADING', 'GRADED', 'FALLBACK_SELF_ASSESSMENT', 'FAILED']);

export const WRITING_CRITERIA = [
  { key: 'task_response', name: 'Task Response' },
  { key: 'coherence', name: 'Coherence & Cohesion' },
  { key: 'lexical', name: 'Lexical Resource' },
  { key: 'grammar', name: 'Grammatical Range & Accuracy' },
] as const;
export const SPEAKING_CRITERIA = [
  { key: 'fluency', name: 'Fluency & Coherence' },
  { key: 'lexical', name: 'Lexical Resource' },
  { key: 'grammar', name: 'Grammatical Range & Accuracy' },
  { key: 'pronunciation', name: 'Pronunciation' },
] as const;

export const isWritingKind = (k: SubmissionKindName): boolean => k === 'WRITING_TASK1' || k === 'WRITING_TASK2' || k === 'MINI_TASK_WRITING';
export const isMiniTaskKind = (k: SubmissionKindName): boolean => k === 'MINI_TASK_WRITING' || k === 'MINI_TASK_SPEAKING';

// ------------------------------------------------------------------ permintaan
/** NFC + trim; karakter kontrol selain \n dan \t ditolak. */
const ResponseText = z
  .string()
  .transform((s) => s.normalize('NFC').trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(5000, { message: 'too_long' })
      .refine((s) => !/[^\P{Cc}\n\t]/u.test(s), { message: 'control_char' }),
  );

export const CreateWritingSubmissionRequestSchema = z
  .strictObject({
    kind: z.enum(['WRITING_TASK1', 'WRITING_TASK2', 'MINI_TASK_WRITING']),
    attempt_id: Uuid.optional(),
    question_id: z.string().min(1).max(40).optional(),
    sub_module_id: Uuid.optional(),
    response_text: ResponseText,
    duration_sec: z.number().int().min(0).max(7200).optional(),
  })
  .superRefine((v, ctx) => {
    const mini = v.kind === 'MINI_TASK_WRITING';
    const need = (field: 'attempt_id' | 'question_id' | 'sub_module_id', code: string, required: boolean) => {
      const has = v[field] !== undefined;
      if (required && !has) ctx.addIssue({ code: 'custom', message: code, path: [field] });
      if (!required && has) ctx.addIssue({ code: 'custom', message: 'unexpected_field', path: [field] });
    };
    need('attempt_id', 'attempt_required', !mini);
    need('question_id', 'question_required', !mini);
    need('sub_module_id', 'sub_module_required', mini);
  });
export type CreateWritingSubmissionRequest = z.infer<typeof CreateWritingSubmissionRequestSchema>;

/** Field teks multipart `POST /submissions/speaking` (berkas `audio` divalidasi terpisah). */
export const CreateSpeakingSubmissionFieldsSchema = z
  .strictObject({
    kind: z.enum(['SPEAKING_PART1', 'SPEAKING_PART2', 'SPEAKING_PART3', 'MINI_TASK_SPEAKING'], { message: 'invalid_kind' }),
    attempt_id: Uuid.optional(),
    question_id: z.string().min(1).max(40).optional(),
    sub_module_id: Uuid.optional(),
    duration_sec: z.coerce.number().int().min(0).max(180).optional(),
  })
  .superRefine((v, ctx) => {
    const mini = v.kind === 'MINI_TASK_SPEAKING';
    const need = (field: 'attempt_id' | 'question_id' | 'sub_module_id', code: string, required: boolean) => {
      const has = v[field] !== undefined;
      if (required && !has) ctx.addIssue({ code: 'custom', message: code, path: [field] });
      if (!required && has) ctx.addIssue({ code: 'custom', message: 'unexpected_field', path: [field] });
    };
    need('attempt_id', 'attempt_required', !mini);
    need('question_id', 'question_required', !mini);
    need('sub_module_id', 'sub_module_required', mini);
  });
export type CreateSpeakingSubmissionFields = z.infer<typeof CreateSpeakingSubmissionFieldsSchema>;

export const SubmissionParamsSchema = z.strictObject({ submission_id: Uuid });

export const ListSubmissionsQuerySchema = z.strictObject({
  kind: SubmissionKind.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20),
});

/** Kunci tepat per jenis (Writing/Speaking) diperiksa server; nilai 0-9 kelipatan 0.5. */
export const SelfAssessmentRequestSchema = z.strictObject({
  criteria_scores: z.record(z.string().min(1).max(30), Band),
});
export type SelfAssessmentRequest = z.infer<typeof SelfAssessmentRequestSchema>;

export const RecordingPreferencesRequestSchema = z.strictObject({ keep_recordings: z.boolean() });

// ------------------------------------------------------------------ DTO
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
export type RecordingDTOType = z.infer<typeof RecordingDTO>;

export const EvaluationDTO = z.strictObject({
  id: Uuid,
  run_number: z.number().int(),
  method: z.enum(['AI_LOCAL', 'SELF_ASSESSMENT']),
  overall_band: Band,
  criteria: z.array(z.strictObject({ key: z.string(), name: z.string(), band: Band, comment_id: z.string().nullable() })),
  strengths_id: z.array(z.string()),
  improvements_id: z.array(z.string()),
  corrections: z.array(z.strictObject({ original: z.string(), improved: z.string(), reason_id: z.string() })),
  band7_rewrite: z.string().nullable(),
  task_requirement_met: z.boolean().nullable(),
  flags: EvaluationFlagsDTO,
  model_name: z.string().nullable(),
  disclaimer: z.literal(DISCLAIMER),
  created_at: IsoDateTime,
});
export type EvaluationDTOType = z.infer<typeof EvaluationDTO>;

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
export type SubmissionDTOType = z.infer<typeof SubmissionDTO>;

export const SubmissionListItemDTO = z.strictObject({
  id: Uuid,
  kind: SubmissionKind,
  status: SubmissionStatus,
  overall_band: Band.nullable(),
  method: z.enum(['AI_LOCAL', 'SELF_ASSESSMENT']).nullable(),
  word_count: z.number().int().nullable(),
  prompt_excerpt: z.string().max(120),
  created_at: IsoDateTime,
});

export const CreateSubmissionResponseSchema = z.strictObject({
  data: z.strictObject({ submission: SubmissionDTO, quota: QuotaDTO }),
});
export const GetSubmissionResponseSchema = z.strictObject({ data: z.strictObject({ submission: SubmissionDTO }) });
export const SelfAssessmentResponseSchema = z.strictObject({
  data: z.strictObject({ submission: SubmissionDTO, evaluation: EvaluationDTO }),
});
export const ConsentResponseSchema = z.strictObject({ data: z.strictObject({ user: UserDTO }) });

export const AiStatusDTO = z.strictObject({
  enabled: z.boolean(),
  available: z.boolean(),
  queue: z.strictObject({ waiting: z.number().int(), estimated_wait_sec: z.number().int().nullable() }),
  quota: QuotaDTO,
  recording_retention_days: z.number().int(),
});

// ------------------------------------------------------------------ keluaran LLM (divalidasi di server)
const Criterion = z.strictObject({ band: Band, comment_id: z.string().min(1).max(400) });
const Correction = z.strictObject({
  original: z.string().max(300),
  improved: z.string().max(300),
  reason_id: z.string().max(300),
});
const EvaluationShared = {
  overall_band: Band,
  task_requirement_met: z.boolean(),
  strengths_id: z.array(z.string().max(300)).min(1).max(4),
  improvements_id: z.array(z.string().max(300)).min(1).max(5),
  corrections: z.array(Correction).max(8),
  band7_rewrite: z.string().max(1500),
};

export const WritingEvaluationOutputSchema = z.strictObject({
  criteria: z.strictObject({
    task_response: Criterion,
    coherence: Criterion,
    lexical: Criterion,
    grammar: Criterion,
  }),
  ...EvaluationShared,
});
export type WritingEvaluationOutput = z.infer<typeof WritingEvaluationOutputSchema>;

export const SpeakingEvaluationOutputSchema = z.strictObject({
  criteria: z.strictObject({
    fluency: Criterion,
    lexical: Criterion,
    grammar: Criterion,
    pronunciation: Criterion,
  }),
  ...EvaluationShared,
});
export type SpeakingEvaluationOutput = z.infer<typeof SpeakingEvaluationOutputSchema>;
