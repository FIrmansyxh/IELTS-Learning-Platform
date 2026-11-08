import { MeResponseSchema } from '@/contracts/auth';
import { ProfileListResponseSchema, type CreateProfileRequest } from '@/contracts/profiles';
import { apiFetch } from './client';

/** Klien profil lokal (SPEC-025): daftar, buat, pilih, ganti, hapus. */
export const profilesApi = {
  list: async (signal?: AbortSignal) => (await apiFetch('/profiles', { schema: ProfileListResponseSchema, signal })).data,

  create: async (body: CreateProfileRequest) =>
    (await apiFetch('/profiles', { method: 'POST', body, schema: MeResponseSchema })).data.user,

  select: async (profileId: string) =>
    (await apiFetch(`/profiles/${profileId}/select`, { method: 'POST', schema: MeResponseSchema })).data.user,

  /** Ganti profil: hapus cookie sesi. */
  leave: async () => {
    await apiFetch('/profiles/leave', { method: 'POST' });
  },

  remove: async (profileId: string, confirm_name: string) => {
    await apiFetch(`/profiles/${profileId}`, { method: 'DELETE', body: { confirm_name } });
  },
};

