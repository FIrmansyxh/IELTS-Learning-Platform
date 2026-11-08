import type { z } from 'zod';
import type {
  AdminUserDTO,
  AuditLogItemDTO,
  SettingDTO,
} from '@/contracts/admin';
import type { PageMetaSchema, UserDTO } from '@/contracts/common';

/** Tipe klien diturunkan dari skema bersama (`z.infer`), bukan dari nama ekspor tipe backend. */
export type User = z.infer<typeof UserDTO>;
export type PageMeta = z.infer<typeof PageMetaSchema>;
export type AdminUser = z.infer<typeof AdminUserDTO>;
export type Setting = z.infer<typeof SettingDTO>;
export type AuditLogEntry = z.infer<typeof AuditLogItemDTO>;
export type UnlockLevel = 'TIER' | 'MODULE' | 'SUB_MODULE';
