import { z } from 'zod';
import { QuestionPublicSchema } from './attempts';

export const SIMULATION_SECTIONS = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const;
export type SimulationSection = (typeof SIMULATION_SECTIONS)[number];

export const SIMULATION_SECTION_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'AWAITING_GRADING',
  'GRADED',
] as const;
export type SimulationSectionStatus = (typeof SIMULATION_SECTION_STATUSES)[number];

export const OVERALL_STATUSES = ['COMPLETE', 'PARTIAL_SELECTION', 'PENDING_SECTIONS'] as const;
export type OverallStatus = (typeof OVERALL_STATUSES)[number];

// ───────────────────────────── OPTIONS ─────────────────────────────
export const SimulationSectionOptionSchema = z.strictObject({
  section: z.enum(SIMULATION_SECTIONS),
  available: z.boolean(),
  unavailable_reason: z.string().nullable(),
  unavailable_detail: z.string().nullable(),
  time_limit_seconds: z.number().int().nullable(),
  question_count: z.number().int(),
});
export type SimulationSectionOption = z.infer<typeof SimulationSectionOptionSchema>;

export const SimulationOptionsResponseSchema = z.strictObject({
  data: z.strictObject({
    sections: z.array(SimulationSectionOptionSchema),
    in_progress_attempt_id: z.string().uuid().nullable(),
  }),
});
export type SimulationOptionsResponse = z.infer<typeof SimulationOptionsResponseSchema>;

// ───────────────────────────── CREATE ─────────────────────────────
export const CreateSimulationRequestSchema = z.strictObject({
  sections: z
    .array(z.enum(SIMULATION_SECTIONS))
    .min(1, { message: 'too_small' })
    .max(4, { message: 'too_big' })
    .refine((items) => new Set(items).size === items.length, {
      message: 'duplicate_value',
    }),
});
export type CreateSimulationRequest = z.infer<typeof CreateSimulationRequestSchema>;

export const CreatedSimulationSectionSchema = z.strictObject({
  section: z.enum(SIMULATION_SECTIONS),
  order: z.number().int(),
  status: z.enum(SIMULATION_SECTION_STATUSES),
  time_limit_seconds: z.number().int().nullable(),
  question_count: z.number().int(),
});
export type CreatedSimulationSection = z.infer<typeof CreatedSimulationSectionSchema>;

export const CreateSimulationResponseSchema = z.strictObject({
  data: z.strictObject({
    attempt_id: z.string().uuid(),
    status: z.literal('IN_PROGRESS'),
    mode: z.literal('EXAM'),
    sections: z.array(CreatedSimulationSectionSchema),
  }),
});
export type CreateSimulationResponse = z.infer<typeof CreateSimulationResponseSchema>;

// ───────────────────────────── GET STATE ─────────────────────────────
export const SimulationSectionStateSchema = z.strictObject({
  section: z.enum(SIMULATION_SECTIONS),
  order: z.number().int(),
  status: z.enum(SIMULATION_SECTION_STATUSES),
  time_limit_seconds: z.number().int().nullable(),
  started_at: z.string().datetime().nullable(),
  deadline_at: z.string().datetime().nullable(),
  submitted_at: z.string().datetime().nullable(),
  remaining_seconds: z.number().int().nullable(),
  auto_submitted: z.boolean(),
  answered_count: z.number().int(),
  question_count: z.number().int(),
});
export type SimulationSectionState = z.infer<typeof SimulationSectionStateSchema>;

export const SimulationStateResponseSchema = z.strictObject({
  data: z.strictObject({
    attempt_id: z.string().uuid(),
    status: z.enum(['IN_PROGRESS', 'AWAITING_GRADING', 'GRADED', 'ABANDONED']),
    server_now: z.string().datetime(),
    sections: z.array(SimulationSectionStateSchema),
    active_section: z.enum(SIMULATION_SECTIONS).nullable(),
  }),
});
export type SimulationStateResponse = z.infer<typeof SimulationStateResponseSchema>;

// ───────────────────────────── SECTION DETAIL ─────────────────────────────
export const SimulationPartSchema = z.strictObject({
  part_no: z.number().int(),
  passage_markdown: z.string().nullable(),
  listening: z
    .strictObject({
      audio_url: z.string(),
      mime_type: z.string(),
      duration_sec: z.number().int(),
      note: z.string().nullable(),
    })
    .nullable(),
  question_ids: z.array(z.string()),
});
export type SimulationPart = z.infer<typeof SimulationPartSchema>;

export const SimulationAnswerItemSchema = z.strictObject({
  question_id: z.string(),
  response: z.record(z.string(), z.unknown()),
});

export const SimulationSubmissionItemSchema = z.strictObject({
  question_id: z.string(),
  kind: z.string(),
  submission_id: z.string().uuid(),
  status: z.string(),
});
export type SimulationSubmissionItem = z.infer<typeof SimulationSubmissionItemSchema>;
export type SimulationSubmission = SimulationSubmissionItem;

export const SimulationSectionDetailResponseSchema = z.strictObject({
  data: z.strictObject({
    section: z.enum(SIMULATION_SECTIONS),
    status: z.enum(SIMULATION_SECTION_STATUSES),
    remaining_seconds: z.number().int().nullable(),
    server_now: z.string().datetime(),
    parts: z.array(SimulationPartSchema),
    questions: z.array(QuestionPublicSchema),
    answers: z.array(SimulationAnswerItemSchema),
    submissions: z.array(SimulationSubmissionItemSchema),
  }),
});
export type SimulationSectionDetailResponse = z.infer<typeof SimulationSectionDetailResponseSchema>;

// ───────────────────────────── SUBMIT SECTION ─────────────────────────────
export const SubmitSectionResponseSchema = z.strictObject({
  data: z.strictObject({
    section: z.enum(SIMULATION_SECTIONS),
    status: z.enum(['AWAITING_GRADING', 'GRADED']),
    band: z.number().nullable(),
    raw_score: z.number().nullable(),
    max_score: z.number().nullable(),
    attempt_status: z.string(),
  }),
});
export type SubmitSectionResponse = z.infer<typeof SubmitSectionResponseSchema>;

// ───────────────────────────── RESULT ─────────────────────────────
export const WritingDetailSchema = z.strictObject({
  task1_band: z.number(),
  task2_band: z.number(),
});

export const SpeakingDetailSchema = z.strictObject({
  part1_band: z.number().nullable(),
  part2_band: z.number().nullable(),
  part3_band: z.number().nullable(),
});

export const SimulationSectionResultSchema = z.strictObject({
  section: z.enum(SIMULATION_SECTIONS),
  status: z.enum(SIMULATION_SECTION_STATUSES),
  band: z.number().nullable(),
  raw_score: z.number().nullable(),
  max_score: z.number().nullable(),
  verified: z.boolean().nullable(),
  detail: z.union([WritingDetailSchema, SpeakingDetailSchema]).nullable(),
});
export type SimulationSectionResult = z.infer<typeof SimulationSectionResultSchema>;

export const SimulationOverallResultSchema = z.strictObject({
  status: z.enum(OVERALL_STATUSES),
  band: z.number().nullable(),
  indicative_band: z.number().nullable(),
  label: z.string(),
});
export type SimulationOverallResult = z.infer<typeof SimulationOverallResultSchema>;

export const SimulationResultResponseSchema = z.strictObject({
  data: z.strictObject({
    attempt_id: z.string().uuid(),
    status: z.enum(['IN_PROGRESS', 'AWAITING_GRADING', 'GRADED', 'ABANDONED']),
    selected_sections: z.array(z.enum(SIMULATION_SECTIONS)),
    sections: z.array(SimulationSectionResultSchema),
    overall: SimulationOverallResultSchema,
    disclaimer: z.literal('Perkiraan latihan, bukan skor resmi IELTS.'),
  }),
});
export type SimulationResultResponse = z.infer<typeof SimulationResultResponseSchema>;

// ───────────────────────────── STATE MOCK.V1 ─────────────────────────────
export interface MockPartState {
  part_no: number;
  bank_set_id: string;
  bank_code: string;
  passage_no: number | null;
  passage_markdown: string | null;
  listening_asset_id: string | null;
  audio_duration_sec: number | null;
  attribution_text?: string | null;
}

export interface MockQuestionState {
  position: number;
  question_id: string;
  bank_set_id: string;
  part_no: number;
  skill: string;
  question_type: string;
  option_order: string[] | null;
  question: Record<string, unknown>; // Data soal asli lengkap
}

export interface MockSectionState {
  section: SimulationSection;
  order: number;
  time_limit_seconds: number | null;
  parts: MockPartState[];
  questions: MockQuestionState[];
}

export interface MockTestState {
  schema: 'mock.v1';
  rng_seed: string;
  sections: MockSectionState[];
  v?: number;
  order?: string[];
  served?: Record<string, { option_order?: string[] | null }>;
  last_resume_at?: string;
}
