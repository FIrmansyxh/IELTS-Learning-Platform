import { z } from 'zod';
import { SkillCategory } from './common';

/**
 * Kontrak Konten v1.1 (SPEC-004). Dipakai CLI `content:validate|import` dan SPEC-019.
 * Struktur di sini; aturan silang (jawaban di dalam opsi, rujukan aset, dst.) ada di
 * src/server/content/validate.ts. Token `message` pada refine kustom = kode galat kontrak.
 */
export const CONTRACT_VERSIONS = ['1.0', '1.1', '1.2'] as const;

const text = (min: number, max: number) => z.string().min(min).max(max);
const intRange = (min: number, max: number) => z.number().int().min(min).max(max);

export const Origin = z.enum(['ORIGINAL_AUTHORED', 'AI_GENERATED_REVIEWED', 'OPEN_LICENSED_ADAPTED']);
export const SetType = z.enum(['SKIP_MODULE_TEST', 'SKIP_TIER_TEST', 'TIER_BOSS_EXAM', 'BOSS_SECTION', 'PLACEMENT_TEST']);
export const ManifestAssetKind = z.enum(['SLIDE_IMAGE', 'DOCUMENT', 'AUDIO_LISTENING', 'IMAGE']);
export const ManifestRights = z.enum(['OWN_ORIGINAL', 'VERIFIED_OPEN', 'UNVERIFIED']);

// Segmen dipisah satu tanda hubung (tidak ambigu), panjang dibatasi 40 oleh skema: linear.
// eslint-disable-next-line security/detect-unsafe-regex
export const QUESTION_ID_RE = /^Q-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;
export const ASSET_CODE_RE = /^[a-z0-9][a-z0-9/_-]{2,79}$/;
export const MODULE_CODE_RE = /^[1-4]\.\d{1,2}$/;
export const SUB_MODULE_CODE_RE = /^[1-4]\.\d{1,2}\.\d{1,2}$/;
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// ---------------------------------------------------------------- Question
const qBase = {
  question_id: text(1, 40).regex(QUESTION_ID_RE, { message: 'invalid_question_id' }),
  skill: SkillCategory,
  prompt: text(1, 2000),
  points: intRange(1, 20).default(1),
  target_time_ms: intRange(1000, 600000).optional(),
  difficulty: intRange(1, 5).optional(),
  passage_no: intRange(1, 3).optional(),
  section_no: intRange(1, 4).optional(),
};
const explain = { explanation_id: text(1, 2000) };
const explainOpt = { explanation_id: text(1, 2000).optional() };
const answers = (min: number, max: number, len = 100) => z.array(text(1, len)).min(min).max(max);

const McqSingle = z.strictObject({
  question_type: z.literal('MCQ_SINGLE'),
  ...qBase,
  ...explain,
  options: z.array(text(1, 500)).min(2).max(8),
  correct_answers: answers(1, 1, 500),
});
const McqMulti = z.strictObject({
  question_type: z.literal('MCQ_MULTI'),
  ...qBase,
  ...explain,
  options: z.array(text(1, 500)).min(3).max(8),
  correct_answers: answers(2, 7, 500),
});
const Tfng = z.strictObject({ question_type: z.literal('TFNG'), ...qBase, ...explain, correct_answers: answers(1, 1) });
const Ynng = z.strictObject({ question_type: z.literal('YNNG'), ...qBase, ...explain, correct_answers: answers(1, 1) });
const FillBlank = z.strictObject({
  question_type: z.literal('FILL_IN_BLANK'),
  ...qBase,
  ...explain,
  correct_answers: answers(1, 20),
  max_words: intRange(1, 10).optional(),
});
const ShortAnswer = z.strictObject({
  question_type: z.literal('SHORT_ANSWER'),
  ...qBase,
  ...explain,
  correct_answers: answers(1, 20),
  max_words: intRange(1, 10),
});
const matching = z.strictObject({
  left: z.array(text(1, 500)).min(2).max(15),
  right: z.array(text(1, 500)).min(2).max(15),
  allow_reuse: z.boolean().default(false),
});
const MatchDropdown = z.strictObject({
  question_type: z.literal('MATCHING_DROPDOWN'),
  ...qBase,
  ...explain,
  matching,
  correct_answers: z.array(z.number().int().min(0)).min(2).max(15),
});
const MatchDrag = z.strictObject({
  question_type: z.literal('MATCHING_DRAG'),
  ...qBase,
  ...explain,
  matching,
  correct_answers: z.array(z.number().int().min(0)).min(2).max(15),
});
const Reorder = z.strictObject({
  question_type: z.literal('SENTENCE_REORDER'),
  ...qBase,
  ...explain,
  segments: z.array(text(1, 500)).min(3).max(12),
});
const ErrorRecog = z.strictObject({
  question_type: z.literal('ERROR_RECOGNITION'),
  ...qBase,
  ...explain,
  tokens: z.array(text(1, 200)).min(3).max(40),
  correct_answers: z.array(z.number().int().min(0)).min(1).max(3),
});
const WritingTask = z.strictObject({
  question_type: z.literal('WRITING_TASK'),
  ...qBase,
  ...explainOpt,
  task_kind: z.enum(['TASK1', 'TASK2']),
  min_words: intRange(20, 500).optional(),
  time_limit_minutes: intRange(5, 90).optional(),
  stimulus_asset_code: z.string().regex(ASSET_CODE_RE, { message: 'invalid_asset_code' }).optional(),
});
const SpeakingTask = z.strictObject({
  question_type: z.literal('SPEAKING_TASK'),
  ...qBase,
  ...explainOpt,
  part: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  prep_seconds: intRange(0, 120).optional(),
  record_seconds: intRange(15, 180).optional(),
  cue_points: z.array(text(1, 200)).max(6).default([]),
  /** Opsional: prompt kustom untuk AI pihak ketiga. Bila kosong, dibuat otomatis (ADR-004). */
  external_eval_prompt: text(1, 4000).optional(),
});

export const QuestionSchema = z.discriminatedUnion('question_type', [
  McqSingle,
  McqMulti,
  Tfng,
  Ynng,
  FillBlank,
  ShortAnswer,
  MatchDropdown,
  MatchDrag,
  Reorder,
  ErrorRecog,
  WritingTask,
  SpeakingTask,
]);
export type Question = z.infer<typeof QuestionSchema>;
export type QuestionType = Question['question_type'];
export const OBJECTIVE_TYPES: readonly QuestionType[] = [
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
];
export const AI_TASK_TYPES: readonly QuestionType[] = ['WRITING_TASK', 'SPEAKING_TASK'];

// ---------------------------------------------------------------- Items
const Video = z.strictObject({
  video_id: z.string().superRefine((v, ctx) => {
    if (v === 'YOUTUBE_VIDEO_ID') ctx.addIssue({ code: 'custom', message: 'placeholder_video' });
    else if (!VIDEO_ID_RE.test(v)) ctx.addIssue({ code: 'custom', message: 'invalid_video_id' });
  }),
  title: text(1, 200),
  instructor_channel: text(0, 100).optional(),
  language: z.enum(['ID', 'EN']),
  start_sec: intRange(0, 21600),
  end_sec: intRange(0, 21600),
});
const Slide = z.strictObject({
  order: z.number().int().min(1),
  asset_code: z.string().optional(),
  image_url: z.string().max(500).optional(),
  caption: text(1, 300),
  alt: text(0, 300).optional(),
});
const Attachment = z.strictObject({
  title: text(1, 200),
  file_type: z.enum(['PDF', 'DOCX']),
  asset_code: z.string().optional(),
  file_url: z.string().max(500).optional(),
});
const MiniTask = z.strictObject({
  task_type: z.enum(['AI_SHORT_WRITING', 'AI_SHORT_SPEAKING', 'SELF_CHECK']),
  prompt: text(1, 2000),
  ai_rubric_criteria: text(1, 1000),
});
export const Materials = z.strictObject({
  article_markdown: text(1, 100000),
  videos: z.array(Video).max(10).optional(),
  slides: z.array(Slide).max(40).optional(),
  attachments: z.array(Attachment).max(10).optional(),
  mini_task: MiniTask.optional(),
});
export const ActiveDrill = z.strictObject({
  time_limit_seconds: intRange(30, 3600),
  pass_percent: intRange(1, 100).optional(),
  reading_passage_markdown: text(1, 60000).optional(),
  listening_asset_code: z.string().regex(ASSET_CODE_RE, { message: 'invalid_asset_code' }).optional(),
  questions: z.array(QuestionSchema).min(1).max(50),
});

const provenance = {
  origin: Origin.optional(),
  source_code: text(1, 40).optional(),
  attribution_text: text(0, 500).optional(),
};

export const ModuleItem = z.strictObject({
  tier_number: intRange(1, 4),
  module_code: z.string().regex(MODULE_CODE_RE, { message: 'invalid_module_code' }),
  module_category: SkillCategory,
  title: text(1, 150),
  order_index: z.number().int().min(1).optional(),
});

export const MaterialVariant = z.strictObject({
  style: z.enum(['LEARN_FIRST', 'PRACTICE_FIRST', 'CASE_BASED']),
  article_markdown: text(1, 100000),
  videos: z.array(Video).max(10).optional(),
  slides: z.array(Slide).max(40).optional(),
  attachments: z.array(Attachment).max(10).optional(),
  mini_task: MiniTask.optional(),
  attribution_text: text(0, 500).optional(),
});

export const SubModuleItem = z.strictObject({
  tier_number: intRange(1, 4),
  module_code: z.string().regex(MODULE_CODE_RE, { message: 'invalid_module_code' }),
  module_category: SkillCategory.optional(),
  sub_module_code: z.string().regex(SUB_MODULE_CODE_RE, { message: 'invalid_sub_module_code' }),
  sub_module_title: text(1, 200),
  passing_score_percent: intRange(1, 100).optional(),
  order_index: z.number().int().min(1).optional(),
  ...provenance,
  materials: Materials.optional(),
  materials_variants: z.array(MaterialVariant).max(2).optional(),
  active_drill: ActiveDrill.optional(),
});

export const TrackItemContent = z.strictObject({
  kind: z.enum(['SUB_MODULE', 'CHECKPOINT']),
  sub_module_code: z.string().regex(SUB_MODULE_CODE_RE, { message: 'invalid_sub_module_code' }).optional(),
  week_no: intRange(1, 4).optional(),
  day_no: intRange(1, 5).optional(),
});

export const LearningTrackContent = z.strictObject({
  // eslint-disable-next-line security/detect-unsafe-regex
  track_code: text(4, 30).regex(/^GT-[A-Z0-9]+(-[A-Z0-9]+)*$/, { message: 'invalid_track_code' }),
  title: text(1, 100),
  description: text(1, 500),
  kind: z.enum(['CURRICULUM', 'CURATED']),
  layout: z.enum(['LIST', 'SPRINT']).optional(),
  delivery_style_default: z.enum(['LEARN_FIRST', 'PRACTICE_FIRST', 'CASE_BASED']),
  target_band_min: z.number().min(0).max(9).refine((v) => Number.isInteger(v * 2), 'band_invalid'),
  target_band_max: z.number().min(0).max(9).refine((v) => Number.isInteger(v * 2), 'band_invalid'),
  recommended_for: text(1, 200),
  sort_order: intRange(1, 99),
  items: z.array(TrackItemContent).max(60).optional(),
});

export const AssessmentSetItem = z.strictObject({
  set_type: SetType,
  title: text(1, 200),
  module_code: z.string().regex(MODULE_CODE_RE, { message: 'invalid_module_code' }).optional(),
  tier_number: intRange(1, 4).optional(),
  skill_category: z.enum(['LISTENING', 'READING', 'WRITING', 'SPEAKING']).optional(),
  time_limit_seconds: intRange(30, 14400).optional(),
  pass_percent: intRange(1, 100).optional(),
  reading_passage_markdown: text(1, 60000).optional(),
  listening_asset_code: z.string().regex(ASSET_CODE_RE, { message: 'invalid_asset_code' }).optional(),
  ...provenance,
  questions: z.array(QuestionSchema).max(200),
});

export const ContentPackageSchema = z.strictObject({
  contract_version: z.enum(CONTRACT_VERSIONS),
  modules: z.array(ModuleItem).optional(),
  sub_modules: z.array(SubModuleItem).optional(),
  assessment_sets: z.array(AssessmentSetItem).optional(),
  learning_tracks: z.array(LearningTrackContent).max(20).optional(),
});
export type ContentPackage = z.infer<typeof ContentPackageSchema>;
export type SubModuleItemType = z.infer<typeof SubModuleItem>;
export type MaterialVariantType = z.infer<typeof MaterialVariant>;
export type LearningTrackContentType = z.infer<typeof LearningTrackContent>;
export type TrackItemContentType = z.infer<typeof TrackItemContent>;
export type AssessmentSetItemType = z.infer<typeof AssessmentSetItem>;
export type ModuleItemType = z.infer<typeof ModuleItem>;

export const AssetRegistration = z.strictObject({
  asset_code: z.string().regex(ASSET_CODE_RE, { message: 'invalid_asset_code' }),
  kind: ManifestAssetKind,
  title: text(1, 200),
  source_code: text(1, 40),
  rights_status: z.enum(['OWN_ORIGINAL', 'VERIFIED_OPEN', 'UNVERIFIED', 'EMBED_ONLY', 'LINK_ONLY']),
  file: text(1, 300),
  attribution_text: text(0, 500).optional(),
});
export const AssetManifestSchema = z.strictObject({
  contract_version: z.enum(CONTRACT_VERSIONS),
  assets: z.array(AssetRegistration).max(500),
});
export type AssetManifest = z.infer<typeof AssetManifestSchema>;
export type AssetRegistrationType = z.infer<typeof AssetRegistration>;

export interface ContentIssue {
  path: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}
