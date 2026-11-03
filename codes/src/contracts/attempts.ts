import { z } from 'zod';
import { AssessmentType, IsoDateTime, SkillCategory, Uuid } from './common';
import { MasteryCrownLevel } from './player';

/** Skema mesin soal & attempt (SPEC-006). Klien longgar terhadap kunci tambahan. */
export const QuestionType = z.enum([
  'MCQ_SINGLE',
  'MCQ_MULTI',
  'TFNG',
  'YNNG',
  'FILL_IN_BLANK',
  'SHORT_ANSWER',
  'MATCHING_DROPDOWN',
  'MATCHING_DRAG',
  'SENTENCE_REORDER',
  'ERROR_RECOGNITION',
  'WRITING_TASK',
  'SPEAKING_TASK',
]);
export type QuestionTypeName = z.infer<typeof QuestionType>;

export const QuestionPublicSchema = z.object({
  question_id: z.string(),
  question_type: QuestionType,
  skill: SkillCategory,
  prompt: z.string(),
  points: z.number(),
  target_time_ms: z.number().int().nullable(),
  passage_no: z.number().int().nullable().optional(),
  section_no: z.number().int().nullable().optional(),
  options: z.array(z.object({ option_id: z.string(), text: z.string() })).nullable(),
  choose_count: z.number().int().nullable(),
  fixed_choices: z.array(z.string()).nullable(),
  max_words: z.number().int().nullable(),
  matching: z
    .object({
      left: z.array(z.object({ item_id: z.string(), text: z.string() })),
      right: z.array(z.object({ choice_id: z.string(), text: z.string() })),
      allow_reuse: z.boolean(),
    })
    .nullable(),
  segments: z.array(z.object({ segment_id: z.string(), text: z.string() })).nullable(),
  tokens: z.array(z.object({ index: z.number().int(), text: z.string() })).nullable(),
  ai_task: z
    .object({
      kind: z.enum(['WRITING', 'SPEAKING']),
      task_kind: z.enum(['TASK1', 'TASK2']).optional(),
      min_words: z.number().int().optional(),
      time_limit_minutes: z.number().int().optional(),
      part: z.number().int().optional(),
      prep_seconds: z.number().int().optional(),
      record_seconds: z.number().int().optional(),
      cue_points: z.array(z.string()).optional(),
      stimulus_url: z.string().optional(),
    })
    .nullable(),
});
export type QuestionPublic = z.infer<typeof QuestionPublicSchema>;

/** Bentuk `response` yang dikirim klien per tipe (tanpa is_correct/score/waktu). */
export const AnswerResponseSchema = z.union([
  z.strictObject({ option_ids: z.array(z.string()).min(1) }),
  z.strictObject({ choice: z.string() }),
  z.strictObject({ text: z.string() }),
  z.strictObject({ pairs: z.array(z.strictObject({ item_id: z.string(), choice_id: z.string() })).min(1) }),
  z.strictObject({ segment_ids: z.array(z.string()).min(1) }),
  z.strictObject({ token_indexes: z.array(z.number().int()).min(1).max(3) }),
]);
export type AnswerResponse = z.infer<typeof AnswerResponseSchema>;

export const FeedbackSchema = z.object({
  is_correct: z.boolean(),
  score: z.number(),
  max_score: z.number(),
  correct_answer: z.object({ display: z.array(z.string()) }),
  explanation_id: z.string(),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

// Respons tersimpan dibaca longgar; klien hanya mengirim bentuk AnswerResponse.
const StoredResponse = z.record(z.string(), z.unknown());

export const AttemptStatus = z.enum(['IN_PROGRESS', 'SUBMITTED', 'GRADED', 'EXPIRED', 'ABANDONED']);

export const AttemptSchema = z.object({
  id: Uuid,
  assessment_set_id: Uuid,
  assessment_type: AssessmentType,
  mode: z.enum(['PRACTICE', 'EXAM']),
  status: AttemptStatus,
  title: z.string(),
  started_at: IsoDateTime,
  server_now: IsoDateTime,
  deadline_at: IsoDateTime.nullable(),
  remaining_seconds: z.number().int().nullable(),
  time_limit_seconds: z.number().int(),
  pass_percent: z.number().nullable(),
  question_count: z.number().int(),
  answered_count: z.number().int(),
  current_index: z.number().int(),
  passage_markdown: z.string().nullable(),
  listening: z
    .object({ audio_url: z.string(), mime_type: z.string(), duration_sec: z.number().int() })
    .nullable(),
  questions: z.array(QuestionPublicSchema),
  answers: z.array(z.object({ question_id: z.string(), response: StoredResponse, feedback: FeedbackSchema.nullable() })),
  resumed: z.boolean(),
  sections: z.array(z.unknown()).nullable().optional(),
});
export type Attempt = z.infer<typeof AttemptSchema>;

export const AttemptResponseSchema = z.object({ data: AttemptSchema });

export const StartAttemptRequestSchema = z.strictObject({ assessment_set_id: Uuid });

export const SubmitAnswerRequestSchema = z.strictObject({ response: AnswerResponseSchema });

export const SubmitAnswerResponseSchema = z.object({
  data: z.object({
    question_id: z.string(),
    saved: z.boolean(),
    answered_count: z.number().int(),
    feedback: FeedbackSchema.nullable(),
    next_question: z.unknown().nullable().optional(),
  }),
});

export const UnlockedItemSchema = z.object({ kind: z.string(), id: z.string(), label: z.string() });

export const AttemptResultSchema = z.object({
  attempt: z.object({
    id: Uuid,
    assessment_set_id: Uuid,
    assessment_type: AssessmentType,
    mode: z.enum(['PRACTICE', 'EXAM']),
    status: AttemptStatus,
    started_at: IsoDateTime,
    submitted_at: IsoDateTime.nullable(),
    raw_score: z.number(),
    max_score: z.number(),
    score_percent: z.number(),
    pass_percent: z.number().nullable(),
    passed: z.boolean().nullable(),
    points_awarded: z.number().int(),
    band_score: z.number().nullable(),
  }),
  per_skill: z.array(
    z.object({ skill: SkillCategory, raw_score: z.number(), max_score: z.number(), score_percent: z.number() }),
  ),
  review: z
    .array(
      z.object({
        question_id: z.string(),
        // Mode ujian (EXAM) tidak lagi memuat is_correct per soal (QA F-08-01): klien toleran terhadap ketiadaannya.
        is_correct: z.boolean().nullable().optional(),
        score: z.number(),
        max_score: z.number(),
        response: StoredResponse.nullable().optional(),
        correct_answer: z.object({ display: z.array(z.string()) }).optional(),
        explanation_id: z.string().optional(),
      }),
    )
    .nullable(),
  progress: z
    .object({
      sub_module_id: Uuid,
      status: z.string(),
      mastery_crown: MasteryCrownLevel,
      best_score_percent: z.number(),
      next_sub_module_code: z.string().nullable(),
      unlocked: z.array(UnlockedItemSchema),
    })
    .nullable(),
  skip: z.unknown().nullable().optional(),
  boss: z.unknown().nullable().optional(),
  placement: z.unknown().nullable().optional(),
  gamification: z.unknown().nullable().optional(),
});
export type AttemptResult = z.infer<typeof AttemptResultSchema>;
export const AttemptResultResponseSchema = z.object({ data: AttemptResultSchema });
