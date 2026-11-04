import { z } from 'zod';
import { IsoDateTime, JobDTO, PageMetaSchema, Uuid } from './common';

/** Kontrak SPEC-019 (bulk importer). Lihat catatan `assets.ts` soal `z.object`. */
export const ImportStatus = z.enum([
  'UPLOADED',
  'VALIDATING',
  'PREVIEW_READY',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
  'CANCELLED',
  'ROLLED_BACK',
]);
export type ImportStatusValue = z.infer<typeof ImportStatus>;
/** Batch aktif (SPEC-019 I1). */
export const ACTIVE_IMPORT_STATUSES: readonly ImportStatusValue[] = ['UPLOADED', 'VALIDATING', 'PUBLISHING'];

export const EntityKind = z.enum(['MODULE', 'SUB_MODULE', 'ASSESSMENT_SET', 'QUESTION']);
export const ItemStatus = z.enum(['VALID', 'INVALID', 'APPLIED', 'SKIPPED']);
export const ItemAction = z.enum(['CREATE', 'UPDATE', 'NOOP']);
export const Severity = z.enum(['error', 'warning']);

export const ImportBlockerSchema = z.looseObject({
  code: z.string(),
  message: z.string().optional(),
  asset_code: z.string().optional(),
  entity_code: z.string().optional(),
});
export type ImportBlocker = z.infer<typeof ImportBlockerSchema>;

export const BatchDTO = z.object({
  id: Uuid,
  format: z.enum(['JSON', 'CSV']),
  csv_kind: z.enum(['QUESTIONS']).nullable(),
  contract_version: z.string().nullable(),
  file_name: z.string(),
  status: ImportStatus,
  total_items: z.number().int(),
  valid_items: z.number().int(),
  invalid_items: z.number().int(),
  created_count: z.number().int(),
  updated_count: z.number().int(),
  skipped_count: z.number().int(),
  summary: z
    .object({
      warnings: z.number().int(),
      noop: z.number().int(),
      by_kind: z.record(z.string(), z.unknown()).optional(),
      /** F-20-03 (aditif): true bila batch memuat konten `AI_GENERATED_REVIEWED` yang berubah (publikasi PUBLISHED wajib `confirm_reviewed`). */
      has_ai_generated: z.boolean().optional(),
      last_error: z
        .object({ code: z.string(), message: z.string(), blockers: z.array(ImportBlockerSchema).optional() })
        .nullable()
        .optional(),
    })
    .nullable(),
  target_status: z.enum(['DRAFT', 'PUBLISHED']).nullable(),
  job: JobDTO.nullable(),
  created_at: IsoDateTime,
  validated_at: IsoDateTime.nullable(),
  published_at: IsoDateTime.nullable(),
});
export type Batch = z.infer<typeof BatchDTO>;

export const ItemIssueDTO = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string(),
  severity: Severity,
});
export type ItemIssue = z.infer<typeof ItemIssueDTO>;

export const ItemDTO = z.object({
  row_number: z.number().int(),
  entity_kind: EntityKind,
  entity_code: z.string().nullable(),
  status: ItemStatus,
  action: ItemAction.nullable(),
  errors: z.array(ItemIssueDTO),
  content_hash: z.string().nullable(),
});
export type ImportItem = z.infer<typeof ItemDTO>;

export const ItemDetailDTO = ItemDTO.extend({ payload: z.record(z.string(), z.unknown()).nullable() });
export type ImportItemDetail = z.infer<typeof ItemDetailDTO>;

export const BatchResponseSchema = z.object({ data: BatchDTO });
export const BatchListResponseSchema = z.object({ data: z.array(BatchDTO), meta: PageMetaSchema });
export const ItemListResponseSchema = z.object({ data: z.array(ItemDTO), meta: PageMetaSchema });
export const ItemDetailResponseSchema = z.object({ data: ItemDetailDTO });
export const ImportContractResponseSchema = z.object({
  data: z.object({ contract_version: z.string(), json_schema: z.record(z.string(), z.unknown()) }),
});

export const PublishBatchRequestSchema = z.object({
  target_status: z.enum(['DRAFT', 'PUBLISHED']),
  acknowledge_warnings: z.boolean().optional(),
});
export type PublishBatchRequest = z.infer<typeof PublishBatchRequestSchema>;

export const IMPORT_MAX_MB = 5;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Skema SISI SERVER SPEC-019 (ditambahkan Backend; skema klien di atas tidak diubah).
// ──────────────────────────────────────────────────────────────────────────────────────────────
export const BatchIdParamSchema = z.strictObject({ batch_id: Uuid });
export const BatchRowParamSchema = z.strictObject({ batch_id: Uuid, row_number: z.coerce.number().int().min(0).max(1_000_000) });
export const TemplateKindParamSchema = z.strictObject({ kind: z.string().min(1).max(40) });

/** Field teks multipart `POST /admin/import-batches`; `csv_kind` wajib untuk CSV dan dilarang untuk JSON. */
export const CreateImportBatchFieldsSchema = z
  .strictObject({
    format: z.enum(['JSON', 'CSV']),
    csv_kind: z.enum(['QUESTIONS']).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.format === 'CSV' && v.csv_kind === undefined) ctx.addIssue({ code: 'custom', path: ['csv_kind'], message: 'csv_kind_required' });
    if (v.format === 'JSON' && v.csv_kind !== undefined) ctx.addIssue({ code: 'custom', path: ['csv_kind'], message: 'csv_kind_not_allowed' });
  });

export const PublishBatchBodySchema = z.strictObject({
  target_status: z.enum(['DRAFT', 'PUBLISHED']),
  acknowledge_warnings: z.boolean().default(false),
  /**
   * F-20-03 (aditif, SPEC-020 K2): wajib `true` bila target `PUBLISHED` dan batch memuat konten `AI_GENERATED_REVIEWED`
   * (Admin menyatakan telah meninjau). Tanpa itu: 409 `REVIEW_CONFIRMATION_REQUIRED`. Pelaku dicatat sebagai `confirmed_by` di audit.
   */
  confirm_reviewed: z.boolean().default(false),
});

export const BatchListQuerySchema = z.strictObject({
  status: ImportStatus.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export const ItemListQuerySchema = z.strictObject({
  status: ItemStatus.optional(),
  action: ItemAction.optional(),
  entity_kind: EntityKind.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});

/** Batas ukuran berkas impor (I2). */
export const IMPORT_MAX_BYTES = IMPORT_MAX_MB * 1_048_576;
