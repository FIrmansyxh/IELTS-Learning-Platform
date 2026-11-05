import { z } from 'zod';
import { Uuid } from './common';

export const ReviewStatusEnum = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'ARCHIVED',
]);
export type ReviewStatus = z.infer<typeof ReviewStatusEnum>;
export const ContentStatusEnum = ReviewStatusEnum;
export type ContentStatus = ReviewStatus;

export const UpdateModuleRequestSchema = z
  .object({
    title: z.string().min(1).max(150).optional(),
    order_index: z.number().int().min(1).optional(),
  })
  .strict()
  .refine(
    (d) => d.title !== undefined || d.order_index !== undefined,
    { message: 'empty_update' },
  );
export type UpdateModuleRequest = z.infer<typeof UpdateModuleRequestSchema>;

export const UpdateSubModuleRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    order_index: z.number().int().min(1).optional(),
    passing_score_percent: z.number().int().min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.title !== undefined ||
      d.order_index !== undefined ||
      d.passing_score_percent !== undefined,
    { message: 'empty_update' },
  );
export type UpdateSubModuleRequest = z.infer<typeof UpdateSubModuleRequestSchema>;

export const MiniTaskRequestSchema = z.object({
  task_type: z.enum(['AI_SHORT_WRITING', 'AI_SHORT_SPEAKING', 'SELF_CHECK']),
  prompt: z.string().min(1).max(2000),
  ai_rubric_criteria: z.string().min(1).max(1000).optional().nullable(),
});

export const UpdateMaterialRequestSchema = z
  .object({
    article_markdown: z.string().min(1).max(100000).optional(),
    attribution_text: z.string().max(500).nullable().optional(),
    mini_task: MiniTaskRequestSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.article_markdown !== undefined ||
      d.attribution_text !== undefined ||
      d.mini_task !== undefined,
    { message: 'empty_update' },
  );
export type UpdateMaterialRequest = z.infer<typeof UpdateMaterialRequestSchema>;

export const UpdateAssessmentSetRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    time_limit_seconds: z.number().int().min(30).max(14400).optional(),
    pass_percent: z.number().int().min(1).max(100).nullable().optional(),
    reading_passage_markdown: z.string().max(60000).nullable().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.title !== undefined ||
      d.time_limit_seconds !== undefined ||
      d.pass_percent !== undefined ||
      d.reading_passage_markdown !== undefined,
    { message: 'empty_update' },
  );
export type UpdateAssessmentSetRequest = z.infer<typeof UpdateAssessmentSetRequestSchema>;

export const UpdateQuestionRequestSchema = z
  .object({
    prompt: z.string().min(1).max(2000).optional(),
    explanation_id: z.string().min(1).max(2000).optional(),
    options: z.array(z.object({ option_id: z.string(), text: z.string() })).optional(),
    correct_answers: z.array(z.string()).optional(),
    max_words: z.number().int().optional(),
    points: z.number().min(1).max(20).optional(),
    target_time_ms: z.number().int().min(1000).max(600000).nullable().optional(),
    difficulty: z.number().int().min(1).max(5).nullable().optional(),
    passage_no: z.number().int().min(1).max(3).nullable().optional(),
    section_no: z.number().int().min(1).max(4).nullable().optional(),
    matching: z
      .object({
        left: z.array(z.object({ item_id: z.string(), text: z.string() })),
        right: z.array(z.object({ choice_id: z.string(), text: z.string() })),
        allow_reuse: z.boolean(),
        pairs: z.array(z.object({ item_id: z.string(), choice_id: z.string() })),
      })
      .optional(),
    segments: z.array(z.string()).optional(),
    tokens: z.array(z.string()).optional(),
  })
  .strict()
  .refine(
    (d) => Object.keys(d).length > 0,
    { message: 'empty_update' },
  );
export type UpdateQuestionRequest = z.infer<typeof UpdateQuestionRequestSchema>;

export const ChangeStatusRequestSchema = z.object({
  status: ReviewStatusEnum,
  reason: z.string().optional(),
  confirm_reviewed: z.boolean().optional(),
});
export type ChangeStatusRequest = z.infer<typeof ChangeStatusRequestSchema>;

export const AssessmentSetsQuerySchema = z.object({
  assessment_type: z.string().optional(),
  status: ReviewStatusEnum.optional(),
  tier_number: z.coerce.number().int().min(1).max(4).optional(),
  q: z.string().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export type AssessmentSetsQuery = z.infer<typeof AssessmentSetsQuerySchema>;

export const RevisionEntityTypeEnum = z.enum([
  'modules',
  'sub_modules',
  'learning_materials',
  'assessment_sets',
  'questions',
  'SUB_MODULE',
  'LEARNING_MATERIAL',
  'ASSESSMENT_SET',
]);
export type RevisionEntityType = z.infer<typeof RevisionEntityTypeEnum>;

export const ContentRevisionsQuerySchema = z.object({
  entity_type: RevisionEntityTypeEnum,
  entity_id: Uuid,
  page: z.coerce.number().int().min(1).default(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).default(20).optional(),
});
export type ContentRevisionsQuery = z.infer<typeof ContentRevisionsQuerySchema>;
