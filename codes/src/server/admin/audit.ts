import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { auditLog, users } from '@/db/schema';
import { maskEmail } from '../audit';
import { getDb } from '../db';

export interface AuditQuery {
  page: number;
  page_size: number;
  action?: string;
  actor_user_id?: string;
  entity_type?: string;
  from?: string;
  to?: string;
}

export async function listAuditLog(q: AuditQuery) {
  const db = getDb();
  const conds: SQL[] = [];
  if (q.action) conds.push(eq(auditLog.action, q.action));
  if (q.actor_user_id) conds.push(eq(auditLog.actorUserId, q.actor_user_id));
  if (q.entity_type) conds.push(eq(auditLog.entityType, q.entity_type));
  if (q.from) conds.push(gte(auditLog.createdAt, new Date(q.from)));
  if (q.to) conds.push(lte(auditLog.createdAt, new Date(q.to)));
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(auditLog).where(where);
  const rows = await db
    .select({ a: auditLog, email: users.email })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(where)
    .orderBy(desc(auditLog.id))
    .limit(q.page_size)
    .offset((q.page - 1) * q.page_size);
  return {
    total: Number(total),
    rows: rows.map(({ a, email }) => ({
      id: a.id,
      actor_user_id: a.actorUserId,
      actor_email_masked: email ? maskEmail(email) : null,
      action: a.action,
      entity_type: a.entityType,
      entity_id: a.entityId,
      metadata: (a.metadata ?? null) as Record<string, unknown> | null,
      ip_hash_prefix: a.ipHash ? a.ipHash.slice(0, 8) : null,
      created_at: a.createdAt.toISOString(),
    })),
  };
}
