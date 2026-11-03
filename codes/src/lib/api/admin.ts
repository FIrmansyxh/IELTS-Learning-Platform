import {
  AdminCreateUserResponseSchema,
  AdminHealthResponseSchema,
  AdminUpdateUserResponseSchema,
  AuditLogResponseSchema,
  CreateInviteResponseSchema,
  InviteListResponseSchema,
  AdminResetPasswordResponseSchema,
  SettingsListResponseSchema,
  UpdateSettingResponseSchema,
  AdminUserListResponseSchema,
} from '@/contracts/admin';
import { z } from 'zod';
import { apiFetch } from './client';
import type { UnlockLevel } from './types';

/** Respons override progres (SPEC-003); diurai sisi klien agar tidak bergantung pada ekspor backend. */
const UnlockResponseSchema = z.object({
  data: z.object({
    level: z.enum(['TIER', 'MODULE', 'SUB_MODULE']),
    target_id: z.string(),
    status: z.string(),
    unlock_source: z.string(),
  }),
});

export type UserListParams = {
  page: number;
  page_size: number;
  q?: string;
  role?: 'learner' | 'admin';
  status?: 'ACTIVE' | 'DISABLED';
  include_deleted?: boolean;
};
export type InviteListParams = {
  page: number;
  page_size: number;
  status?: 'active' | 'used' | 'expired' | 'revoked';
};
export type AuditParams = {
  page: number;
  page_size: number;
  action?: string;
  actor_user_id?: string;
  from?: string;
  to?: string;
};

export const adminApi = {
  health: async () => (await apiFetch('/admin/health', { schema: AdminHealthResponseSchema })).data,

  users: (p: UserListParams) =>
    apiFetch('/admin/users', {
      query: { ...p, include_deleted: p.include_deleted ? true : undefined },
      schema: AdminUserListResponseSchema,
    }),
  createUser: async (body: { email: string; display_name: string; role: 'learner' | 'admin' }) =>
    (await apiFetch('/admin/users', { method: 'POST', body, schema: AdminCreateUserResponseSchema })).data,
  updateUser: async (userId: string, body: { role?: 'learner' | 'admin'; status?: 'ACTIVE' | 'DISABLED' }) =>
    (await apiFetch(`/admin/users/${userId}`, { method: 'PATCH', body, schema: AdminUpdateUserResponseSchema })).data
      .user,
  resetPassword: async (userId: string) =>
    (await apiFetch(`/admin/users/${userId}/reset-password`, { method: 'POST', schema: AdminResetPasswordResponseSchema }))
      .data,
  deleteUser: async (userId: string) => {
    await apiFetch(`/admin/users/${userId}/delete`, { method: 'POST' });
  },
  unlockProgress: async (userId: string, body: { level: UnlockLevel; target_id: string }) =>
    (
      await apiFetch(`/admin/users/${userId}/progress/unlock`, {
        method: 'POST',
        body,
        schema: UnlockResponseSchema,
      })
    ).data,

  invites: (p: InviteListParams) => apiFetch('/admin/invites', { query: p, schema: InviteListResponseSchema }),
  createInvite: async (body: { expires_in_days?: number }) =>
    (await apiFetch('/admin/invites', { method: 'POST', body, schema: CreateInviteResponseSchema })).data,
  revokeInvite: async (inviteId: string) => {
    await apiFetch(`/admin/invites/${inviteId}`, { method: 'DELETE' });
  },

  settings: async () => (await apiFetch('/admin/settings', { schema: SettingsListResponseSchema })).data,
  updateSetting: async (key: string, value: number | string | boolean) =>
    (
      await apiFetch(`/admin/settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: { value },
        schema: UpdateSettingResponseSchema,
      })
    ).data,

  auditLog: (p: AuditParams) => apiFetch('/admin/audit-log', { query: p, schema: AuditLogResponseSchema }),
};
