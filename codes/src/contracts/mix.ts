import { z } from 'zod';
import { SkillCategory, Uuid } from './common';
import { MIX_BANK_KINDS } from './question-bank';

/**
 * Kontrak Mix Builder (SPEC-022): `POST /api/v1/mix-sessions` dan tambahan `data.mix` pada hasil attempt
 * `MIX_PRACTICE`. Dipakai server dan klien. Kode galat validasi (`details[].code`) mengikuti spec:
 * `unrecognized_key`, `too_small`, `too_big`, `invalid_value`, `invalid_type`, `difficulty_range_invalid`.
 */
export const MIX_SKILLS = ['GRAMMAR', 'VOCAB', 'READING', 'WRITING', 'SPEAKING'] as const;
export type MixSkill = (typeof MIX_SKILLS)[number];

export const MIX_QUESTION_TYPES = [
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
] as const;

export const MIX_COUNT_MIN = 5;
export const MIX_COUNT_MAX = 40;
export const MIX_SEED_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Token `message` = kode galat yang dilaporkan ke klien (lihat `zodDetails`). */
const uniqueEnumArray = <T extends readonly [string, ...string[]]>(values: T, max: number) =>
  z
    .array(z.enum(values, { error: 'invalid_value' }), { error: 'invalid_type' })
    .min(1, { error: 'too_small' })
    .max(max, { error: 'too_big' })
    .refine((a) => new Set(a).size === a.length, { error: 'invalid_value' });

export const MixModeSchema = z.enum(['MANUAL', 'AUTO_WEAKNESS'], { error: 'invalid_value' });
export type MixMode = z.infer<typeof MixModeSchema>;

const diff = () =>
  z
    .number({ error: 'invalid_type' })
    .int({ error: 'invalid_type' })
    .min(1, { error: 'too_small' })
    .max(5, { error: 'too_big' })
    .optional();

export const MixRequestSchema = z
  .strictObject({
    skills: uniqueEnumArray(MIX_SKILLS, 5).optional(),
    bank_kinds: uniqueEnumArray(MIX_BANK_KINDS, 12).optional(),
    question_types: uniqueEnumArray(MIX_QUESTION_TYPES, 13).optional(),
    difficulty_min: diff(),
    difficulty_max: diff(),
    count: z
      .number({ error: 'invalid_type' })
      .int({ error: 'invalid_type' })
      .min(MIX_COUNT_MIN, { error: 'too_small' })
      .max(MIX_COUNT_MAX, { error: 'too_big' }),
    mode: MixModeSchema,
    seed: z.string({ error: 'invalid_type' }).regex(MIX_SEED_RE, { error: 'invalid_value' }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.difficulty_min !== undefined && v.difficulty_max !== undefined && v.difficulty_max < v.difficulty_min) {
      ctx.addIssue({ code: 'custom', path: ['difficulty_max'], message: 'difficulty_range_invalid' });
    }
  });
export type MixRequest = z.infer<typeof MixRequestSchema>;

export const MixSessionSchema = z.object({
  attempt_id: Uuid,
  question_count: z.number().int(),
  mode: MixModeSchema,
  passage_count: z.number().int(),
  ai_item_count: z.number().int(),
});
export type MixSession = z.infer<typeof MixSessionSchema>;
export const MixSessionResponseSchema = z.object({ data: MixSessionSchema });

// ---------------------------------------------------------------- GET /api/v1/mix-sessions/active
export const ActiveMixSessionSchema = z.object({
  attempt_id: Uuid,
  mode: MixModeSchema,
  question_count: z.number().int(),
  answered_count: z.number().int(),
  started_at: z.iso.datetime(),
});
export type ActiveMixSession = z.infer<typeof ActiveMixSessionSchema>;
/** `data` = null bila profil tidak punya sesi campuran IN_PROGRESS. */
export const ActiveMixSessionResponseSchema = z.object({ data: ActiveMixSessionSchema.nullable() });

// ---------------------------------------------------------------- hasil (`GET /attempts/{id}/result` -> `data.mix`)
export const MixResultSchema = z.object({
  per_skill: z.array(
    z.object({ skill: SkillCategory, answered: z.number().int(), correct: z.number().int(), percent: z.number() }),
  ),
  per_question_type: z.array(
    z.object({ question_type: z.string(), answered: z.number().int(), correct: z.number().int(), percent: z.number() }),
  ),
  ai_items: z.array(
    z.object({
      question_id: z.string(),
      skill: z.enum(['WRITING', 'SPEAKING']),
      submission_id: Uuid.nullable(),
      status: z.string().nullable(),
    }),
  ),
  suggested_banks: z.array(
    z.object({ bank_code: z.string(), title: z.string(), bank_kind: z.string(), reason: z.literal('SKILL_TERLEMAH') }),
  ),
});
export type MixResult = z.infer<typeof MixResultSchema>;

// ---------------------------------------------------------------- `attempts.state` (SERVER SAJA; tidak pernah dikirim apa adanya)
export const MIX_STATE_SCHEMA = 'mix.v1' as const;
export interface MixStateQuestion {
  position: number;
  question_id: string;
  bank_set_id: string;
  bank_code: string;
  bank_version: number;
  skill: string;
  question_type: string;
  passage_no: number | null;
  /** ID opaque opsi/pilihan/segmen sesuai urutan tersaji (rahasia pengacakan ada di `served`); null bila tidak diacak. */
  option_order: string[] | null;
  /** Objek Question lengkap termasuk kunci jawaban. */
  question: unknown;
}
export interface MixState {
  schema: typeof MIX_STATE_SCHEMA;
  mode: MixMode;
  rng_seed: string;
  filters: {
    skills: string[];
    bank_kinds: string[];
    question_types: string[];
    difficulty_min: number;
    difficulty_max: number;
  };
  passages: Array<{ bank_set_id: string; passage_no: number; markdown: string }>;
  questions: MixStateQuestion[];
}
