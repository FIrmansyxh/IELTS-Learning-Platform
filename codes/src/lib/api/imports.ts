import {
  BatchListResponseSchema,
  BatchResponseSchema,
  ImportContractResponseSchema,
  ItemDetailResponseSchema,
  ItemListResponseSchema,
  type ImportItem,
  type PublishBatchRequest,
} from '@/contracts/import';
import { apiFetch } from './client';
import { uploadMultipart, type UploadOptions } from './upload';

/** Body publikasi: `confirm_reviewed` (F-20-03, K2) ada di skema server (`PublishBatchBodySchema`); skema klien lama belum memuatnya. */
export type PublishBatchInput = PublishBatchRequest & { confirm_reviewed?: boolean };

export type BatchListParams = { page: number; page_size: number; status?: string };
export type ItemListParams = {
  page: number;
  page_size: number;
  status?: string;
  action?: string;
  entity_kind?: string;
};

export const IMPORT_TEMPLATE_URLS = {
  json: '/api/v1/admin/import-templates/content-package',
  csv: '/api/v1/admin/import-templates/questions-csv',
} as const;

const ITEM_PAGE = 200;

export const importsApi = {
  list: (p: BatchListParams) => apiFetch('/admin/import-batches', { query: p, schema: BatchListResponseSchema }),
  get: async (batchId: string) => (await apiFetch(`/admin/import-batches/${batchId}`, { schema: BatchResponseSchema })).data,
  items: (batchId: string, p: ItemListParams) =>
    apiFetch(`/admin/import-batches/${batchId}/items`, { query: p, schema: ItemListResponseSchema }),
  item: async (batchId: string, row: number) =>
    (await apiFetch(`/admin/import-batches/${batchId}/items/${row}`, { schema: ItemDetailResponseSchema })).data,
  /** Seluruh item (halaman 200, maks 10 halaman = batas 2.000 item JSON; CSV 5.000 baris -> 25 halaman). */
  allItems: async (batchId: string, filter: Omit<ItemListParams, 'page' | 'page_size'> = {}): Promise<ImportItem[]> => {
    const out: ImportItem[] = [];
    for (let page = 1; page <= 30; page += 1) {
      const res = await apiFetch(`/admin/import-batches/${batchId}/items`, {
        query: { ...filter, page, page_size: ITEM_PAGE },
        schema: ItemListResponseSchema,
      });
      out.push(...res.data);
      if (out.length >= res.meta.total || res.data.length === 0) break;
    }
    return out;
  },
  publish: async (batchId: string, body: PublishBatchInput) =>
    (await apiFetch(`/admin/import-batches/${batchId}/publish`, { method: 'POST', body, schema: BatchResponseSchema })).data,
  cancel: async (batchId: string) =>
    (await apiFetch(`/admin/import-batches/${batchId}/cancel`, { method: 'POST', schema: BatchResponseSchema })).data,
  rollback: async (batchId: string) =>
    (await apiFetch(`/admin/import-batches/${batchId}/rollback`, { method: 'POST', schema: BatchResponseSchema })).data,
  contract: async () => (await apiFetch('/admin/import-contract', { schema: ImportContractResponseSchema })).data,
  upload: async (input: { format: 'JSON' | 'CSV'; file: File }, opts?: UploadOptions) => {
    const form = new FormData();
    form.set('format', input.format);
    if (input.format === 'CSV') form.set('csv_kind', 'QUESTIONS');
    form.set('file', input.file);
    return (await uploadMultipart('/admin/import-batches', form, BatchResponseSchema, opts)).data;
  },
};
