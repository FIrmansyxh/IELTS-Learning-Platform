import {
  ActivateBandTableResponseSchema,
  ActiveBandTablesResponseSchema,
  BandTableListResponseSchema,
  CreateBandTableResponseSchema,
  type CreateBandTableRequest,
} from '@/contracts/band';
import { apiFetch } from './client';

export const bandApi = {
  active: async (signal?: AbortSignal) =>
    (await apiFetch('/band-tables/active', { schema: ActiveBandTablesResponseSchema, signal })).data,
  adminList: async (signal?: AbortSignal) =>
    (await apiFetch('/admin/band-tables', { schema: BandTableListResponseSchema, signal })).data,
  create: async (body: CreateBandTableRequest) =>
    (await apiFetch('/admin/band-tables', { method: 'POST', body, schema: CreateBandTableResponseSchema })).data,
  activate: async (tableId: string) =>
    (await apiFetch(`/admin/band-tables/${tableId}/activate`, { method: 'POST', schema: ActivateBandTableResponseSchema }))
      .data,
  remove: async (tableId: string) => {
    await apiFetch(`/admin/band-tables/${tableId}`, { method: 'DELETE' });
  },
};
