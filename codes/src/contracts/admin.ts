import { z } from 'zod';
import { Band, IsoDateTime, PageMetaSchema, PageQuerySchema, Uuid } from './common';
import { DISPLAY_NAME_RE } from './auth';

/** Kontrak SPEC-002 (admin: pengguna, undangan, pengaturan, audit, kesehatan). */
const emailField = z
  .string()
  .trim()
  .min(3, { message: 'invalid_email' })
  .max(254, { message: 'invalid_email' })
  .refine((v) => z.email().safeParse(v).success, { message: 'invalid_email' });

export const AdminUserDTO = z.strictObject({
  id: Uuid,
  email: z.string(),
  display_name: z.string(),
  role: z.enum(['learner', 'admin']),
  status: z.enum(['ACTIVE', 'DISABLED']),
  target_band: Band.nullable(),
  must_change_password: z.boolean(),
  last_login_at: IsoDateTime.nullable(),
  created_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});
export type AdminUserDTOType = z.infer<typeof AdminUserDTO>;

const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

export const AdminUserListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['learner', 'admin']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  include_deleted: boolQuery.default(false),
});
export const AdminUserListResponseSchema = z.strictObject({ data: z.array(AdminUserDTO), meta: PageMetaSchema });

export const AdminCreateUserRequestSchema = z.strictObject({
  email: emailField,
  display_name: z
    .string()
    .trim()
    .min(2, { message: 'display_name_invalid' })
    .max(80, { message: 'display_name_invalid' })
    .regex(DISPLAY_NAME_RE, { message: 'display_name_invalid' }),
  role: z.enum(['learner', 'admin']),
});
export const AdminCreateUserResponseSchema = z.strictObject({
  data: z.strictObject({ user: AdminUserDTO, temporary_password: z.string().length(16) }),
});

export const AdminUpdateUserRequestSchema = z
  .strictObject({
    role: z.enum(['learner', 'admin']).optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, { message: 'empty_update' });
export const AdminUpdateUserResponseSchema = z.strictObject({ data: z.strictObject({ user: AdminUserDTO }) });

export const AdminResetPasswordResponseSchema = z.strictObject({
  data: z.strictObject({ temporary_password: z.string().length(16) }),
});

export const UserIdParamSchema = z.strictObject({ user_id: Uuid });
export const InviteIdParamSchema = z.strictObject({ invite_id: Uuid });

export const CreateInviteRequestSchema = z.strictObject({
  expires_in_days: z.number().int().min(1).max(30).default(7),
});
export const CreateInviteResponseSchema = z.strictObject({
  data: z.strictObject({ id: Uuid, code: z.string(), expires_at: IsoDateTime, created_at: IsoDateTime }),
});

export const InviteStatus = z.enum(['active', 'used', 'expired', 'revoked']);
export const InviteListQuerySchema = PageQuerySchema.extend({ status: InviteStatus.optional() });
export const InviteListItemDTO = z.strictObject({
  id: Uuid,
  status: InviteStatus,
  expires_at: IsoDateTime,
  created_at: IsoDateTime,
  used_at: IsoDateTime.nullable(),
  used_by_email: z.string().nullable(),
  revoked_at: IsoDateTime.nullable(),
});
export const InviteListResponseSchema = z.strictObject({ data: z.array(InviteListItemDTO), meta: PageMetaSchema });

/**
 * `options` (enum) adalah tambahan aditif terhadap contoh spec agar UI dapat membuat Select tanpa
 * menanam daftar nilai; `min`/`max` null untuk tipe non-int.
 */
export const SettingDTO = z.strictObject({
  key: z.string(),
  value: z.union([z.number(), z.string(), z.boolean()]),
  default: z.union([z.number(), z.string(), z.boolean()]),
  type: z.enum(['int', 'enum', 'bool']),
  min: z.number().nullable(),
  max: z.number().nullable(),
  options: z.array(z.string()).nullable(),
  description: z.string(),
  updated_at: IsoDateTime.nullable(),
  updated_by: Uuid.nullable(),
});
export const SettingsListResponseSchema = z.strictObject({ data: z.array(SettingDTO) });
export const SettingKeyParamSchema = z.strictObject({ key: z.string().min(1).max(80) });
export const UpdateSettingRequestSchema = z.strictObject({ value: z.unknown() });
export const UpdateSettingResponseSchema = z.strictObject({ data: SettingDTO });

const isoQuery = z.iso.datetime({ message: 'invalid_value' });
export const AuditLogQuerySchema = PageQuerySchema.extend({
  action: z.string().min(1).max(60).optional(),
  actor_user_id: Uuid.optional(),
  entity_type: z.string().min(1).max(40).optional(),
  from: isoQuery.optional(),
  to: isoQuery.optional(),
}).refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'range_invalid', path: ['from'] });
export const AuditLogItemDTO = z.strictObject({
  id: z.number().int(),
  actor_user_id: Uuid.nullable(),
  actor_email_masked: z.string().nullable(),
  action: z.string(),
  entity_type: z.string().nullable(),
  entity_id: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  ip_hash_prefix: z.string().nullable(),
  created_at: IsoDateTime,
});
export const AuditLogResponseSchema = z.strictObject({ data: z.array(AuditLogItemDTO), meta: PageMetaSchema });

const compStatus = z.enum(['up', 'down']);
export const AdminHealthResponseSchema = z.strictObject({
  data: z.strictObject({
    db: z.strictObject({ status: compStatus, latency_ms: z.number().int().nullable() }),
    queue: z.strictObject({
      waiting: z.number().int(),
      active: z.number().int(),
      failed_24h: z.number().int(),
      oldest_waiting_age_sec: z.number().int().nullable(),
    }),
    llm: z.strictObject({
      enabled: z.boolean(),
      driver: z.string(),
      status: z.enum(['up', 'down', 'disabled']),
      model_writing: z.string().nullable(),
      model_speaking: z.string().nullable(),
    }),
    stt: z.strictObject({ status: z.enum(['up', 'down', 'disabled']), model: z.string().nullable() }),
    worker: z.strictObject({ heartbeat_age_sec: z.number().int().nullable() }),
    disk: z.strictObject({ assets_used_mb: z.number().int(), assets_free_mb: z.number().int() }),
    app: z.strictObject({ version: z.string(), node: z.string() }),
  }),
});
export type AdminHealth = z.infer<typeof AdminHealthResponseSchema>['data'];

/** SPEC-003: override progres oleh admin. */
export const UnlockLevelSchema = z.enum(['TIER', 'MODULE', 'SUB_MODULE']);
export const AdminUnlockProgressRequestSchema = z.strictObject({ level: UnlockLevelSchema, target_id: Uuid });
export const AdminUnlockProgressResponseSchema = z.strictObject({
  data: z.strictObject({
    level: UnlockLevelSchema,
    target_id: Uuid,
    status: z.literal('UNLOCKED'),
    unlock_source: z.literal('ADMIN'),
  }),
});

// Alias nama yang dipakai Frontend (src/lib/api/admin.ts) dan tipe turunan.
export const ResetPasswordResponseSchema = AdminResetPasswordResponseSchema;
export const SettingListResponseSchema = SettingsListResponseSchema;
export const AuditLogListResponseSchema = AuditLogResponseSchema;
export type AdminUser = AdminUserDTOType;
export type Setting = z.infer<typeof SettingDTO>;
export type Invite = z.infer<typeof InviteListItemDTO>;
export type AuditLogEntry = z.infer<typeof AuditLogItemDTO>;
export type UnlockLevel = z.infer<typeof UnlockLevelSchema>;
