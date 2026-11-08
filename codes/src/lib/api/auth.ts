import { MeResponseSchema, UpdateProfileResponseSchema } from '@/contracts/auth';
import { apiFetch } from './client';

export type UpdateProfileRequest = { display_name?: string; target_band?: 5 | 5.5 | 6 | 6.5 | 7 | null };

/** Sesi/profil aktif (SPEC-025: tanpa login; profil dipilih lewat `profilesApi`). */
export const authApi = {
  me: async (signal?: AbortSignal) =>
    (await apiFetch('/auth/me', { schema: MeResponseSchema, signal })).data.user,
  updateProfile: async (body: UpdateProfileRequest) =>
    (await apiFetch('/me/profile', { method: 'PATCH', body, schema: UpdateProfileResponseSchema })).data.user,
};
