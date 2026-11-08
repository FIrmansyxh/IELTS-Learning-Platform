import { z } from 'zod';
import { SkillCategory } from './common';
import { ASSET_CODE_RE, Origin, QuestionSchema } from './content';

/**
 * Kontrak Bank Soal v1.0 (SPEC-022, ADR-004): bank bertema untuk IELTS General Training.
 * Item bank memakai `QuestionSchema` kontrak konten 1.1 sehingga mesin soal tidak berubah.
 */
export const BANK_CONTRACT_VERSIONS = ['1.0'] as const;

export const BANK_KINDS = [
  'READING_GT_S1',
  'READING_GT_S2',
  'READING_GT_S3',
  'WRITING_GT_T1_FORMAL',
  'WRITING_GT_T1_SEMI',
  'WRITING_GT_T1_INFORMAL',
  'WRITING_GT_T2',
  'SPEAKING_P1',
  'SPEAKING_P2',
  'SPEAKING_P3',
  'GRAMMAR_GT_REGISTER',
  'VOCAB_GT_EVERYDAY',
  // D7: satu bank per bagian Listening; wajib beraudio atau pending_audio (konten dibuat SPEC-024).
  'LISTENING_GT_S1',
  'LISTENING_GT_S2',
  'LISTENING_GT_S3',
  'LISTENING_GT_S4',
] as const;
export type BankKind = (typeof BANK_KINDS)[number];

/** Skill yang sah untuk tiap `bank_kind`. */
export const BANK_KIND_SKILL: Record<BankKind, z.infer<typeof SkillCategory>> = {
  READING_GT_S1: 'READING',
  READING_GT_S2: 'READING',
  READING_GT_S3: 'READING',
  WRITING_GT_T1_FORMAL: 'WRITING',
  WRITING_GT_T1_SEMI: 'WRITING',
  WRITING_GT_T1_INFORMAL: 'WRITING',
  WRITING_GT_T2: 'WRITING',
  SPEAKING_P1: 'SPEAKING',
  SPEAKING_P2: 'SPEAKING',
  SPEAKING_P3: 'SPEAKING',
  GRAMMAR_GT_REGISTER: 'GRAMMAR',
  VOCAB_GT_EVERYDAY: 'VOCAB',
  LISTENING_GT_S1: 'LISTENING',
  LISTENING_GT_S2: 'LISTENING',
  LISTENING_GT_S3: 'LISTENING',
  LISTENING_GT_S4: 'LISTENING',
};

/** Bank Listening dikenali kontrak tetapi tidak dapat dipilih di Mix Builder (D7, Non-Goals). */
export const isListeningBankKind = (k: string): boolean => k.startsWith('LISTENING_GT_S');
/** `bank_kind` yang boleh dipakai di Mix Builder (semua selain Listening). */
export const MIX_BANK_KINDS = BANK_KINDS.filter((k) => !isListeningBankKind(k)) as unknown as readonly [
  Exclude<BankKind, `LISTENING_GT_S${number}`>,
  ...Exclude<BankKind, `LISTENING_GT_S${number}`>[],
];

// Segmen dipisah satu tanda hubung; panjang dibatasi 40 oleh skema.
// eslint-disable-next-line security/detect-unsafe-regex
export const BANK_CODE_RE = /^GT-[A-Z0-9]+(-[A-Z0-9]+)*$/;

export const QuestionBankSchema = z.strictObject({
  bank_code: z.string().min(4).max(40).regex(BANK_CODE_RE, { message: 'invalid_bank_code' }),
  bank_kind: z.enum(BANK_KINDS),
  title: z.string().min(1).max(200),
  skill: SkillCategory,
  exam_module: z.literal('GENERAL_TRAINING'),
  tags: z.array(z.string().min(1).max(40)).max(10).default([]),
  origin: Origin,
  source_code: z.string().min(1).max(40).optional(),
  attribution_text: z.string().max(500).optional(),
  reading_passage_markdown: z.string().min(1).max(60000).optional(),
  /** D7: hanya bank Listening; tepat satu dari `listening_asset_code` atau `pending_audio: true`. */
  listening_asset_code: z.string().regex(ASSET_CODE_RE, { message: 'invalid_asset_code' }).optional(),
  pending_audio: z.boolean().default(false),
  questions: z.array(QuestionSchema).min(1).max(100),
});
export type QuestionBank = z.infer<typeof QuestionBankSchema>;

export const QuestionBankPackageSchema = z.strictObject({
  bank_contract_version: z.enum(BANK_CONTRACT_VERSIONS),
  banks: z.array(QuestionBankSchema).min(1).max(200),
});
export type QuestionBankPackage = z.infer<typeof QuestionBankPackageSchema>;

// ---------------------------------------------------------------- GET /api/v1/banks (SPEC-022)
export const BankListItemSchema = z.object({
  bank_code: z.string(),
  bank_kind: z.enum(BANK_KINDS),
  title: z.string(),
  skill: SkillCategory,
  question_count: z.number().int(),
  question_types: z.array(z.object({ question_type: z.string(), count: z.number().int() })),
  has_passage: z.boolean(),
  /** false untuk skill LISTENING (runner campuran tidak punya pemutar audio ujian). */
  selectable_in_mix: z.boolean(),
});
export type BankListItem = z.infer<typeof BankListItemSchema>;
export const BanksResponseSchema = z.object({ data: z.array(BankListItemSchema) });
export type BanksResponse = z.infer<typeof BanksResponseSchema>;
