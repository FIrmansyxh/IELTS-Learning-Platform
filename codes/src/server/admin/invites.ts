import { and, count, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { signupInvites, users } from '@/db/schema';
import { writeAudit } from '../audit';
import { getDb } from '../db';
import { ApiError } from '../http/errors';
import { generateInviteCode, hashInviteCode } from '../auth/invite-code';

export async function createInvite(actorId: string, expiresInDays: number, ipHash: string) {
  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
  const row = await getDb().transaction(async (tx) => {
    const [r] = await tx
      .insert(signupInvites)
      .values({ codeHash: hashInviteCode(code), createdBy: actorId, expiresAt })
      .returning();
    await writeAudit(tx, {
      actorUserId: actorId,
      action: 'INVITE_CREATED',
      entityType: 'invite',
      entityId: r!.id,
      metadata: { expires_in_days: expiresInDays },
      ipHash,
    });
    return r!;
  });
  return { id: row.id, code, expires_at: row.expiresAt.toISOString(), created_at: row.createdAt.toISOString() };
}

export type InviteStatus = 'active' | 'used' | 'expired' | 'revoked';

const statusSql = sql<InviteStatus>`CASE
  WHEN ${signupInvites.revokedAt} IS NOT NULL THEN 'revoked'
  WHEN ${signupInvites.usedAt} IS NOT NULL THEN 'used'
  WHEN ${signupInvites.expiresAt} <= now() THEN 'expired'
  ELSE 'active' END`;

export async function listInvites(q: { page: number; page_size: number; status?: InviteStatus }) {
  const db = getDb();
  let where: SQL | undefined;
  if (q.status === 'revoked') where = isNotNull(signupInvites.revokedAt);
  else if (q.status === 'used') where = and(isNull(signupInvites.revokedAt), isNotNull(signupInvites.usedAt));
  else if (q.status === 'expired') {
    where = and(isNull(signupInvites.revokedAt), isNull(signupInvites.usedAt), sql`${signupInvites.expiresAt} <= now()`);
  } else if (q.status === 'active') {
    where = and(isNull(signupInvites.revokedAt), isNull(signupInvites.usedAt), sql`${signupInvites.expiresAt} > now()`);
  }
  const usedUser = alias(users, 'used_user');
  const [{ total }] = await db.select({ total: count() }).from(signupInvites).where(where);
  const rows = await db
    .select({
      id: signupInvites.id,
      status: statusSql,
      expiresAt: signupInvites.expiresAt,
      createdAt: signupInvites.createdAt,
      usedAt: signupInvites.usedAt,
      usedByEmail: usedUser.email,
      revokedAt: signupInvites.revokedAt,
    })
    .from(signupInvites)
    .leftJoin(usedUser, eq(usedUser.id, signupInvites.usedBy))
    .where(where)
    .orderBy(desc(signupInvites.createdAt), desc(signupInvites.id))
    .limit(q.page_size)
    .offset((q.page - 1) * q.page_size);
  return {
    total: Number(total),
    rows: rows.map((r) => ({
      id: r.id,
      status: r.status,
      expires_at: r.expiresAt.toISOString(),
      created_at: r.createdAt.toISOString(),
      used_at: r.usedAt ? r.usedAt.toISOString() : null,
      used_by_email: r.usedByEmail ?? null,
      revoked_at: r.revokedAt ? r.revokedAt.toISOString() : null,
    })),
  };
}

export async function revokeInvite(actorId: string, inviteId: string, ipHash: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(signupInvites).where(eq(signupInvites.id, inviteId)).for('update');
    if (!row) throw new ApiError('NOT_FOUND');
    if (row.revokedAt || row.usedAt || row.expiresAt.getTime() <= Date.now()) throw new ApiError('INVITE_NOT_ACTIVE');
    await tx.update(signupInvites).set({ revokedAt: new Date() }).where(eq(signupInvites.id, inviteId));
    await writeAudit(tx, { actorUserId: actorId, action: 'INVITE_REVOKED', entityType: 'invite', entityId: inviteId, ipHash });
  });
}
