import {
  AssetDetailResponseSchema,
  AssetListResponseSchema,
  AssetResponseSchema,
  LicenseSummaryResponseSchema,
  SourceListResponseSchema,
  SourceResponseSchema,
  type CreateExternalAssetRequest,
  type CreateSourceRequest,
  type UpdateAssetRequest,
  type UploadableKindValue,
} from '@/contracts/assets';
import { apiFetch } from './client';
import { uploadMultipart, type UploadOptions } from './upload';

export type AssetListParams = {
  page: number;
  page_size: number;
  kind?: string;
  rights_status?: string;
  source_id?: string;
  q?: string;
  referenced?: boolean;
};

export type UploadAssetInput = {
  kind: UploadableKindValue;
  title: string;
  source_id: string;
  asset_code?: string;
  attribution_text?: string;
  file: File;
};

export const assetsApi = {
  sources: async () => (await apiFetch('/admin/content-sources', { schema: SourceListResponseSchema })).data,
  createSource: async (body: CreateSourceRequest) =>
    (await apiFetch('/admin/content-sources', { method: 'POST', body, schema: SourceResponseSchema })).data,

  list: (p: AssetListParams) => apiFetch('/admin/assets', { query: p, schema: AssetListResponseSchema }),
  get: async (assetId: string) =>
    (await apiFetch(`/admin/assets/${assetId}`, { schema: AssetDetailResponseSchema })).data,
  /** Tautan pratinjau berkas (sesi admin; `Cache-Control: private, no-store`). */
  fileUrl: (assetId: string) => `/api/v1/admin/assets/${assetId}/file`,
  update: async (assetId: string, body: UpdateAssetRequest) =>
    (await apiFetch(`/admin/assets/${assetId}`, { method: 'PATCH', body, schema: AssetResponseSchema })).data,
  remove: async (assetId: string) => {
    await apiFetch(`/admin/assets/${assetId}`, { method: 'DELETE' });
  },
  createExternal: async (body: CreateExternalAssetRequest) =>
    (await apiFetch('/admin/assets/external', { method: 'POST', body, schema: AssetResponseSchema })).data,
  upload: async (input: UploadAssetInput, opts?: UploadOptions) => {
    const form = new FormData();
    form.set('kind', input.kind);
    form.set('title', input.title);
    form.set('source_id', input.source_id);
    if (input.asset_code) form.set('asset_code', input.asset_code);
    if (input.attribution_text) form.set('attribution_text', input.attribution_text);
    // `file` terakhir: server membaca aliran berurutan dan menghentikan pembacaan saat melewati batas.
    form.set('file', input.file);
    return (await uploadMultipart('/admin/assets', form, AssetResponseSchema, opts)).data;
  },

  licenseSummary: async () => (await apiFetch('/admin/license-summary', { schema: LicenseSummaryResponseSchema })).data,
};
