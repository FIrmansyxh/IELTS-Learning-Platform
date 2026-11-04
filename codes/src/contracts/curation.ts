import { z } from 'zod';
import { IsoDateTime, PageMetaSchema, ReviewStatus, Uuid } from './common';

/**
 * Skema Admin Kurasi Konten (SPEC-020). Semua endpoint Auth: admin. Body PATCH memakai `z.strictObject` (field tak dikenal
 * -> `unrecognized_key`) dan minimal satu field (`empty_update`). Validasi isi soal penuh ada di `src/server/curation/rules.ts`.
 */
const text = (min: number, max: number) => z.string().min(min).max(max);
const intRange = (min: number, max: number) => z.number().int().min(min).max(max);
const atLeastOne = <T extends Record<string, unknown>>(o: T) => Object.values(o).some((v) => v !== undefined);
const nonEmpty = { message: 'empty_update' } as const;

export const CurationEntity = z.enum(['modules', 'sub-modules', 'assessment-sets']);
export type CurationEntityName = z.infer<typeof CurationEntity>;

// ------------------------------------------------------------------ metadata modul / sub-modul / materi
export const UpdateModuleRequestSchema = z
  .strictObject({ title: text(1, 150).optional(), order_index: intRange(1, 1_000_000).optional() })
  .refine(atLeastOne, nonEmpty);

export const UpdateSubModuleRequestSchema = z
  .strictObject({ title: text(1, 200).optional(), order_index: intRange(1, 1_000_000).optional(), passing_score_percent: intRange(1, 100).optional() })
  .refine(atLeastOne, nonEmpty);

export const MiniTaskInput = z.strictObject({
  task_type: z.enum(['AI_SHORT_WRITING', 'AI_SHORT_SPEAKING', 'SELF_CHECK']),
  prompt: text(1, 2000),
  ai_rubric_criteria: text(1, 1000),
});
export const UpdateMaterialRequestSchema = z
  .strictObject({
    article_markdown: text(1, 100_000).optional(),
    attribution_text: text(0, 500).nullable().optional(),
    mini_task: MiniTaskInput.nullable().optional(),
  })
  .refine(atLeastOne, nonEmpty);

// ------------------------------------------------------------------ set dan soal
export const UpdateAssessmentSetRequestSchema = z
  .strictObject({
    title: text(1, 200).optional(),
    time_limit_seconds: intRange(30, 14_400).optional(),
    pass_percent: intRange(1, 100).nullable().optional(),
    reading_passage_markdown: text(1, 60_000).nullable().optional(),
  })
  .refine(atLeastOne, nonEmpty);

/**
 * Bentuk longgar per-field; aturan bergantung tipe (`field_not_allowed_for_type`) dan skema soal utuh (SPEC-004) diterapkan di
 * service pada soal hasil gabungan. `question_id`, `question_type`, `skill` TIDAK ada di sini -> `unrecognized_key`.
 */
export const UpdateQuestionRequestSchema = z
  .strictObject({
    prompt: text(1, 2000).optional(),
    explanation_id: text(1, 2000).optional(),
    options: z.array(text(1, 500)).max(8).optional(),
    correct_answers: z.array(z.union([text(1, 500), z.number().int().min(0)])).max(15).optional(),
    max_words: intRange(1, 10).optional(),
    points: intRange(1, 20).optional(),
    target_time_ms: intRange(1000, 600_000).nullable().optional(),
    difficulty: intRange(1, 5).nullable().optional(),
    passage_no: intRange(1, 3).nullable().optional(),
    section_no: intRange(1, 4).nullable().optional(),
    matching: z.strictObject({ left: z.array(text(1, 500)).max(15), right: z.array(text(1, 500)).max(15), allow_reuse: z.boolean().optional() }).optional(),
    segments: z.array(text(1, 500)).max(12).optional(),
    tokens: z.array(text(1, 200)).max(40).optional(),
  })
  .refine(atLeastOne, nonEmpty);

export const SetListQuerySchema = z.strictObject({
  assessment_type: z.enum(['ACTIVE_DRILL', 'SKIP_MODULE_TEST', 'SKIP_TIER_TEST', 'TIER_BOSS_EXAM', 'BOSS_SECTION', 'PLACEMENT_TEST']).optional(),
  status: ReviewStatus.optional(),
  tier_number: z.coerce.number().int().min(1).max(4).optional(),
  q: text(1, 100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export const ChangeStatusRequestSchema = z.strictObject({ status: ReviewStatus, confirm_reviewed: z.boolean().optional() });

export const RevisionListQuerySchema = z.strictObject({
  entity_type: z.enum(['SUB_MODULE', 'LEARNING_MATERIAL', 'ASSESSMENT_SET']),
  entity_id: Uuid,
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export const IdParam = (key: string) => z.strictObject({ [key]: Uuid });

// ------------------------------------------------------------------ respons (dipakai tes kontrak)
export const ContentOrigin = z.enum(['ORIGINAL_AUTHORED', 'AI_GENERATED_REVIEWED', 'OPEN_LICENSED_ADAPTED']);
export const SetRefSchema = z.object({
  id: Uuid,
  status: ReviewStatus,
  question_count: z.number().int().optional(),
  version: z.number().int(),
  /** Aditif: asal set (konfirmasi reviu AI, K2, dapat ditampilkan sebelum 409). */
  origin: ContentOrigin.optional(),
  section_skills: z.array(z.string()).optional(),
});
/** `asset_id` (aditif) hanya untuk `ASSET_UNVERIFIED`. */
export const BlockerSchema = z.object({ code: z.string(), entity_type: z.string(), entity_id: z.string(), detail: z.string(), asset_id: Uuid.optional() });
export const CurriculumResponseSchema = z.object({
  data: z.object({
    tiers: z.array(
      z.object({
        tier_number: z.number().int(),
        title: z.string(),
        skip_set: SetRefSchema.nullable(),
        boss: SetRefSchema.nullable(),
        modules: z.array(
          z.object({
            id: Uuid,
            module_code: z.string(),
            title: z.string(),
            order_index: z.number().int(),
            status: ReviewStatus,
            skip_set: SetRefSchema.nullable(),
            sub_modules: z.array(
              z.object({
                id: Uuid,
                sub_module_code: z.string(),
                title: z.string(),
                order_index: z.number().int(),
                status: ReviewStatus,
                passing_score_percent: z.number().int(),
                content_version: z.number().int(),
                origin: ContentOrigin.nullable(),
                has_material: z.boolean(),
                drill: SetRefSchema.nullable(),
                blocker_count: z.number().int().min(0),
              }),
            ),
          }),
        ),
      }),
    ),
    placement: SetRefSchema.nullable(),
  }),
});
export const QualityResponseSchema = z.object({
  data: z.object({
    set_id: Uuid,
    questions: z.array(z.object({ question_id: z.string(), attempts_count: z.number().int(), correct_rate: z.number().min(0).max(1), flag: z.enum(['TOO_HARD', 'TOO_EASY']).nullable() })),
  }),
});
export const ChangeStatusResponseSchema = z.object({
  data: z.object({ id: Uuid, entity: CurationEntity, status: ReviewStatus, reviewed_at: IsoDateTime.nullable() }),
});
export const RevisionListResponseSchema = z.object({
  data: z.array(
    z.object({
      id: Uuid,
      entity_type: z.string(),
      entity_id: Uuid,
      version: z.number().int(),
      changed_by_name: z.string().nullable(),
      import_batch_id: Uuid.nullable(),
      created_at: IsoDateTime,
    }),
  ),
  meta: PageMetaSchema,
});

// ------------------------------------------------------------------ respons lain (aditif; dipakai tes kontrak dan klien)
const RightsStatus = z.enum(['UNVERIFIED', 'OWN_ORIGINAL', 'VERIFIED_OPEN', 'EMBED_ONLY', 'LINK_ONLY']);
export const MiniTaskSchema = z.object({
  task_type: z.enum(['AI_SHORT_WRITING', 'AI_SHORT_SPEAKING', 'SELF_CHECK']),
  prompt: z.string(),
  ai_rubric_criteria: z.string(),
});
export const SubModuleDetailResponseSchema = z.object({
  data: z.object({
    sub_module: z.object({
      id: Uuid,
      sub_module_code: z.string(),
      title: z.string(),
      order_index: z.number().int(),
      status: ReviewStatus,
      passing_score_percent: z.number().int(),
      content_version: z.number().int(),
      module: z.object({ id: Uuid, module_code: z.string(), title: z.string() }),
    }),
    material: z
      .object({
        article_markdown: z.string(),
        origin: ContentOrigin,
        attribution_text: z.string().nullable(),
        content_version: z.number().int(),
        videos: z.array(z.object({ asset_id: Uuid, video_id: z.string(), title: z.string(), start_sec: z.number().int(), end_sec: z.number().int(), rights_status: RightsStatus })),
        slides: z.array(z.object({ asset_id: Uuid, order: z.number().int(), caption: z.string(), rights_status: RightsStatus })),
        attachments: z.array(z.object({ asset_id: Uuid, title: z.string(), file_type: z.string(), rights_status: RightsStatus })),
        mini_task: MiniTaskSchema.nullable(),
      })
      .nullable(),
    drill: z.object({ id: Uuid, status: ReviewStatus, question_count: z.number().int(), version: z.number().int() }).nullable(),
    blockers: z.array(BlockerSchema),
  }),
});
export const ModuleUpdatedResponseSchema = z.object({
  data: z.object({ id: Uuid, module_code: z.string(), title: z.string(), order_index: z.number().int(), status: ReviewStatus }),
});
export const SubModuleUpdatedResponseSchema = z.object({
  data: z.object({
    id: Uuid,
    sub_module_code: z.string(),
    title: z.string(),
    order_index: z.number().int(),
    passing_score_percent: z.number().int(),
    status: ReviewStatus,
    content_version: z.number().int(),
  }),
});
export const MaterialUpdatedResponseSchema = z.object({ data: z.object({ content_version: z.number().int(), updated_at: IsoDateTime }) });
export const SetSummarySchema = z.object({
  id: Uuid,
  assessment_type: z.enum(['ACTIVE_DRILL', 'SKIP_MODULE_TEST', 'SKIP_TIER_TEST', 'TIER_BOSS_EXAM', 'BOSS_SECTION', 'PLACEMENT_TEST']),
  title: z.string(),
  status: ReviewStatus,
  question_count: z.number().int(),
  version: z.number().int(),
  origin: ContentOrigin,
  scope_label: z.string(),
  updated_at: IsoDateTime,
});
export const SetListResponseSchema = z.object({ data: z.array(SetSummarySchema), meta: PageMetaSchema });
export const SetDetailResponseSchema = z.object({
  data: SetSummarySchema.extend({
    time_limit_seconds: z.number().int(),
    pass_percent: z.number().int().nullable(),
    reading_passage_markdown: z.string().nullable(),
    listening_asset_id: Uuid.nullable(),
    attribution_text: z.string().nullable(),
    reviewed_at: IsoDateTime.nullable(),
    /** Aditif: ada attempt hidup (K3); UI dapat menonaktifkan penyuntingan sebelum 409. */
    has_active_attempts: z.boolean(),
    questions: z.array(z.looseObject({ question_id: z.string(), question_type: z.string(), skill: z.string(), prompt: z.string() })),
    blockers: z.array(BlockerSchema),
  }),
});
export const SetUpdatedResponseSchema = z.object({
  data: z.object({ id: Uuid, title: z.string(), time_limit_seconds: z.number().int(), pass_percent: z.number().int().nullable(), version: z.number().int(), content_hash: z.string() }),
});
export const QuestionUpdatedResponseSchema = z.object({
  data: z.object({
    question: z.looseObject({ question_id: z.string(), question_type: z.string(), skill: z.string(), prompt: z.string() }),
    set: z.object({ id: Uuid, version: z.number().int(), content_hash: z.string() }),
  }),
});
export const RevisionDetailResponseSchema = z.object({
  data: z.object({
    id: Uuid,
    entity_type: z.string(),
    entity_id: Uuid,
    version: z.number().int(),
    changed_by_name: z.string().nullable(),
    import_batch_id: Uuid.nullable(),
    created_at: IsoDateTime,
    snapshot: z.record(z.string(), z.unknown()),
  }),
});
