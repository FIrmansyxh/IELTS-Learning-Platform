import {
  AdminHealthResponseSchema,
  AdminUpdateUserResponseSchema,
  AuditLogResponseSchema,
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
  updateUser: async (userId: string, body: { role?: 'learner' | 'admin'; status?: 'ACTIVE' | 'DISABLED' }) =>
    (await apiFetch(`/admin/users/${userId}`, { method: 'PATCH', body, schema: AdminUpdateUserResponseSchema })).data
      .user,
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

  points: async () =>
    (
      await apiFetch('/admin/points', {
        schema: z.object({
          data: z.object({
            users: z.array(
              z.object({
                userId: z.string(),
                email: z.string(),
                displayName: z.string(),
                role: z.string(),
                totalPoints: z.number(),
                dailyStreakDays: z.number(),
                longestDailyStreak: z.number(),
                lastActiveDate: z.string().nullable(),
              }),
            ),
            recentLedger: z.array(
              z.object({
                id: z.number(),
                userId: z.string(),
                userEmail: z.string(),
                userDisplayName: z.string(),
                source: z.string(),
                points: z.number(),
                note: z.string().nullable(),
                createdAt: z.string(),
              }),
            ),
          }),
        }),
      })
    ).data,

  adjustPoints: async (body: { userId: string; points: number; note: string }) =>
    (
      await apiFetch('/admin/points/adjust', {
        method: 'POST',
        body,
        schema: z.object({
          data: z.object({
            totalPoints: z.number(),
          }),
        }),
      })
    ).data,
};
