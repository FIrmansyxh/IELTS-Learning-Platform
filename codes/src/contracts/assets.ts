import { z } from 'zod';
import { IsoDateTime, PageMetaSchema, Uuid } from './common';

/**
 * Kontrak SPEC-018 (sumber konten dan aset berlisensi). Skema DTO memakai `z.object` (bukan strict)
 * agar penambahan field aditif di server tidak memutus klien; field yang dipakai klien tetap wajib.
 */
export const LicenseType = z.enum([
  'OWN',
  'CC0',
  'CC_BY',
  'CC_BY_SA',
  'CC_BY_NC',
  'MIT',
  'EMBED_TOS',
  'LINK_ONLY_COPYRIGHTED',
  'OTHER',
]);
export const AssetKind = z.enum([
  'SLIDE_IMAGE',
  'IMAGE',
  'DOCUMENT',
  'AUDIO_LISTENING',
  'VIDEO_EMBED',
  'REFERENCE_LINK',
]);
export const UploadableKind = z.enum(['SLIDE_IMAGE', 'IMAGE', 'DOCUMENT', 'AUDIO_LISTENING']);
export const ExternalKind = z.enum(['VIDEO_EMBED', 'REFERENCE_LINK']);
export const RightsStatus = z.enum(['UNVERIFIED', 'OWN_ORIGINAL', 'VERIFIED_OPEN', 'EMBED_ONLY', 'LINK_ONLY']);

export type LicenseTypeValue = z.infer<typeof LicenseType>;
export type AssetKindValue = z.infer<typeof AssetKind>;
export type UploadableKindValue = z.infer<typeof UploadableKind>;
export type RightsStatusValue = z.infer<typeof RightsStatus>;

export const SourceDTO = z.object({
  id: Uuid,
  code: z.string(),
  name: z.string(),
  url: z.string().nullable(),
  license_type: LicenseType,
  license_note: z.string().nullable(),
  attribution_template: z.string().nullable(),
  share_alike: z.boolean(),
  non_commercial_only: z.boolean(),
  may_store_copy: z.boolean(),
  asset_count: z.number().int(),
});
export type Source = z.infer<typeof SourceDTO>;

export const AssetDTO = z.object({
  id: Uuid,
  asset_code: z.string().nullable(),
  kind: AssetKind,
  title: z.string(),
  source: z.object({ id: Uuid, code: z.string(), name: z.string(), license_type: z.string() }),
  rights_status: RightsStatus,
  storage_backend: z.enum(['FILESYSTEM', 'MINIO', 'EXTERNAL']),
  mime_type: z.string().nullable(),
  size_bytes: z.number().int().nullable(),
  duration_sec: z.number().int().nullable(),
  external_url: z.string().nullable(),
  external_ref: z.string().nullable(),
  attribution_text: z.string().nullable(),
  license_verified_at: IsoDateTime.nullable(),
  license_verified_by_name: z.string().nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});
export type Asset = z.infer<typeof AssetDTO>;

export const AssetListItemDTO = AssetDTO.extend({ reference_count: z.number().int() });
export type AssetListItem = z.infer<typeof AssetListItemDTO>;

export const AssetReferenceDTO = z.object({
  entity_type: z.enum(['SUB_MODULE', 'ASSESSMENT_SET']),
  entity_id: Uuid,
  label: z.string(),
  status: z.string(),
});
export const AssetDetailDTO = AssetDTO.extend({ referenced_by: z.array(AssetReferenceDTO) });
export type AssetDetail = z.infer<typeof AssetDetailDTO>;

export const SourceListResponseSchema = z.object({ data: z.array(SourceDTO) });
export const SourceResponseSchema = z.object({ data: SourceDTO });
export const AssetResponseSchema = z.object({ data: AssetDTO });
export const AssetListResponseSchema = z.object({ data: z.array(AssetListItemDTO), meta: PageMetaSchema });
export const AssetDetailResponseSchema = z.object({ data: AssetDetailDTO });

export const LicenseSummaryResponseSchema = z.object({
  data: z.object({
    assets_by_rights_status: z.record(z.string(), z.number().int()),
    publish_blockers: z.number().int(),
    non_commercial_sources_in_use: z.array(z.string()),
    share_alike_sources_in_use: z.array(z.string()),
  }),
});
export type LicenseSummary = z.infer<typeof LicenseSummaryResponseSchema>['data'];

/** Aturan nilai `rights_status` yang diizinkan per `kind` (SPEC-018, PATCH asset). */
export const ALLOWED_RIGHTS_BY_KIND: Record<AssetKindValue, readonly RightsStatusValue[]> = {
  SLIDE_IMAGE: ['UNVERIFIED', 'OWN_ORIGINAL', 'VERIFIED_OPEN'],
  IMAGE: ['UNVERIFIED', 'OWN_ORIGINAL', 'VERIFIED_OPEN'],
  DOCUMENT: ['UNVERIFIED', 'OWN_ORIGINAL', 'VERIFIED_OPEN'],
  AUDIO_LISTENING: ['UNVERIFIED', 'OWN_ORIGINAL', 'VERIFIED_OPEN'],
  VIDEO_EMBED: ['UNVERIFIED', 'EMBED_ONLY'],
  REFERENCE_LINK: ['LINK_ONLY'],
};

/** Batas unggah klien (UX saja; server tetap memeriksa magic bytes dan ukuran). */
export const UPLOAD_LIMITS_MB: Record<UploadableKindValue, number> = {
  SLIDE_IMAGE: 5,
  IMAGE: 5,
  DOCUMENT: 25,
  AUDIO_LISTENING: 50,
};
export const UPLOAD_ACCEPT: Record<UploadableKindValue, string> = {
  SLIDE_IMAGE: 'image/webp,image/png,image/jpeg',
  IMAGE: 'image/webp,image/png,image/jpeg',
  DOCUMENT: 'application/pdf,.pdf,.docx',
  AUDIO_LISTENING: 'audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav',
};

export const ASSET_CODE_PATTERN = /^[a-z0-9][a-z0-9/_-]{2,79}$/;
export const SOURCE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/;
export const YOUTUBE_HOSTS = ['www.youtube.com', 'youtube.com', 'youtu.be', 'www.youtube-nocookie.com'] as const;

export const CreateSourceRequestSchema = z.object({
  code: z.string().regex(SOURCE_CODE_PATTERN),
  name: z.string().min(1).max(150),
  url: z.string().max(500).optional(),
  license_type: LicenseType,
  license_note: z.string().max(1000).optional(),
  attribution_template: z.string().max(500).optional(),
  share_alike: z.boolean().optional(),
  non_commercial_only: z.boolean().optional(),
  may_store_copy: z.boolean().optional(),
});
export type CreateSourceRequest = z.infer<typeof CreateSourceRequestSchema>;

export const UpdateAssetRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  attribution_text: z.string().max(500).nullable().optional(),
  rights_status: RightsStatus.optional(),
});
export type UpdateAssetRequest = z.infer<typeof UpdateAssetRequestSchema>;

export const CreateExternalAssetRequestSchema = z.object({
  kind: ExternalKind,
  title: z.string().min(1).max(200),
  source_id: Uuid,
  external_url: z.string().max(500),
  external_ref: z.string().optional(),
  attribution_text: z.string().max(500).optional(),
});
export type CreateExternalAssetRequest = z.infer<typeof CreateExternalAssetRequestSchema>;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Skema SISI SERVER SPEC-018 (ditambahkan Backend; skema klien di atas tidak diubah).
// strictObject: field tak dikenal ditolak `unrecognized_key`; kode detail mengikuti spec.
// ──────────────────────────────────────────────────────────────────────────────────────────────
const NO_COPY_LICENSES: readonly string[] = ['LINK_ONLY_COPYRIGHTED', 'EMBED_TOS'];
const httpsUrl = (max: number) =>
  z
    .string()
    .max(max)
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'https:' && u.hostname.length > 0;
      } catch {
        return false;
      }
    }, { message: 'invalid_url' });

export const SourceIdParamSchema = z.strictObject({ source_id: Uuid });
export const AssetIdParamSchema = z.strictObject({ asset_id: Uuid });

export const CreateSourceBodySchema = z
  .strictObject({
    code: z.string().regex(SOURCE_CODE_PATTERN, { message: 'source_code_invalid' }),
    name: z.string().trim().min(1).max(150),
    url: httpsUrl(500).optional(),
    license_type: LicenseType,
    license_note: z.string().max(1000).optional(),
    attribution_template: z.string().max(500).optional(),
    share_alike: z.boolean().optional(),
    non_commercial_only: z.boolean().optional(),
    may_store_copy: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.may_store_copy === true && NO_COPY_LICENSES.includes(v.license_type)) {
      ctx.addIssue({ code: 'custom', path: ['may_store_copy'], message: 'store_copy_not_allowed' });
    }
  });
export type CreateSourceBody = z.infer<typeof CreateSourceBodySchema>;

/** `code` dan `license_type` tidak boleh diubah (ditolak `unrecognized_key`). */
export const UpdateSourceBodySchema = z
  .strictObject({
    name: z.string().trim().min(1).max(150).optional(),
    url: httpsUrl(500).nullable().optional(),
    license_note: z.string().max(1000).nullable().optional(),
    attribution_template: z.string().max(500).nullable().optional(),
    share_alike: z.boolean().optional(),
    non_commercial_only: z.boolean().optional(),
    may_store_copy: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'empty_update' });
export type UpdateSourceBody = z.infer<typeof UpdateSourceBodySchema>;

/** Field teks multipart `POST /admin/assets`. Berkas (`file`) diperiksa terpisah. */
export const UploadAssetFieldsSchema = z.strictObject({
  kind: z.enum(['SLIDE_IMAGE', 'IMAGE', 'DOCUMENT', 'AUDIO_LISTENING'], { message: 'invalid_kind' }),
  title: z.string().trim().min(1).max(200),
  source_id: Uuid,
  asset_code: z.string().regex(ASSET_CODE_PATTERN, { message: 'asset_code_invalid' }).optional(),
  attribution_text: z.string().max(500).optional(),
});
export type UploadAssetFields = z.infer<typeof UploadAssetFieldsSchema>;

export const CreateExternalAssetBodySchema = z.strictObject({
  kind: ExternalKind,
  title: z.string().trim().min(1).max(200),
  source_id: Uuid,
  external_url: httpsUrl(500),
  external_ref: z.string().optional(),
  attribution_text: z.string().max(500).optional(),
});
export type CreateExternalAssetBody = z.infer<typeof CreateExternalAssetBodySchema>;

export const UpdateAssetBodySchema = z
  .strictObject({
    title: z.string().trim().min(1).max(200).optional(),
    attribution_text: z.string().max(500).nullable().optional(),
    rights_status: RightsStatus.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'empty_update' });
export type UpdateAssetBody = z.infer<typeof UpdateAssetBodySchema>;

const boolQueryParam = z.enum(['true', 'false']).transform((v) => v === 'true');
export const AssetListQuerySchema = z.strictObject({
  kind: AssetKind.optional(),
  rights_status: RightsStatus.optional(),
  source_id: Uuid.optional(),
  q: z.string().min(1).max(100).optional(),
  referenced: boolQueryParam.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export type AssetListQuery = z.infer<typeof AssetListQuerySchema>;
