import { auditLog } from '@/db/schema';
import type { DbOrTx } from './db';

export interface AuditEntry {
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  /** Tanpa PII mentah (email penuh, password, kode undangan, isi esai). */
  metadata?: Record<string, unknown> | null;
  ipHash?: string | null;
}

export async function writeAudit(db: DbOrTx, e: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: e.actorUserId ?? null,
    action: e.action,
    entityType: e.entityType ?? null,
    entityId: e.entityId ?? null,
    metadata: e.metadata ?? null,
    ipHash: e.ipHash ?? null,
  });
}

/** `budi@example.test` -> `b***@example.test` */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}
