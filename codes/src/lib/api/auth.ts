import {
  ChangePasswordResponseSchema,
  LoginResponseSchema,
  MeResponseSchema,
  RegisterResponseSchema,
  SignupConfigResponseSchema,
  UpdateProfileResponseSchema,
} from '@/contracts/auth';
import type { z } from 'zod';
import { apiFetch } from './client';

/** Badan permintaan sisi klien (nilai sudah divalidasi form; server tetap otoritatif). */
export type RegisterRequest = {
  email: string;
  display_name: string;
  password: string;
  invite_code?: string;
};
export type LoginRequest = { email: string; password: string };
export type ChangePasswordRequest = { current_password: string; new_password: string };
export type UpdateProfileRequest = { display_name?: string; target_band?: 5 | 5.5 | 6 | 6.5 | 7 | null };
export type SignupMode = z.infer<typeof SignupConfigResponseSchema>['data']['mode'];

export const authApi = {
  signupConfig: async () => (await apiFetch('/auth/signup-config', { schema: SignupConfigResponseSchema })).data,
  register: async (body: RegisterRequest) =>
    (await apiFetch('/auth/register', { method: 'POST', body, schema: RegisterResponseSchema })).data.user,
  login: async (body: LoginRequest) =>
    (await apiFetch('/auth/login', { method: 'POST', body, schema: LoginResponseSchema })).data.user,
  logout: async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
  },
  me: async (signal?: AbortSignal) =>
    (await apiFetch('/auth/me', { schema: MeResponseSchema, signal })).data.user,
  changePassword: async (body: ChangePasswordRequest) =>
    (await apiFetch('/auth/change-password', { method: 'POST', body, schema: ChangePasswordResponseSchema })).data
      .user,
  updateProfile: async (body: UpdateProfileRequest) =>
    (await apiFetch('/me/profile', { method: 'PATCH', body, schema: UpdateProfileResponseSchema })).data.user,
};
