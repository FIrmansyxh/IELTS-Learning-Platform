import { and, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { users } from '@/db/schema';
import type { AdminUserDTOType } from '@/contracts/admin';
import { writeAudit } from '../audit';
import { getDb, type Tx } from '../db';
import { ApiError } from '../http/errors';
import { generateTemporaryPassword, hashPassword } from '../auth/password';
import { insertUser } from '../auth/service';

type UserRow = typeof users.$inferSelect;

export function toAdminUserDTO(r: UserRow): AdminUserDTOType {
  return {
    id: r.id,
    email: r.email,
    display_name: r.displayName,
    role: r.role,
    status: r.status,
    target_band: r.targetBand === null ? null : Number(r.targetBand),
    must_change_password: r.mustChangePassword,
    last_login_at: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    created_at: r.createdAt.toISOString(),
    deleted_at: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

export interface ListUsersQuery {
  page: number;
  page_size: number;
  q?: string;
  role?: 'learner' | 'admin';
  status?: 'ACTIVE' | 'DISABLED';
  include_deleted: boolean;
}

/** `%`, `_`, `\` diperlakukan literal pada ILIKE. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listUsers(query: ListUsersQuery) {
  const db = getDb();
  const conds = [];
  if (!query.include_deleted) conds.push(isNull(users.deletedAt));
  if (query.role) conds.push(eq(users.role, query.role));
  if (query.status) conds.push(eq(users.status, query.status));
  if (query.q) {
    const pat = `%${escapeLike(query.q)}%`;
    conds.push(or(ilike(users.email, pat), ilike(users.displayName, pat)));
  }
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(users).where(where);
  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(query.page_size)
    .offset((query.page - 1) * query.page_size);
  return { rows: rows.map(toAdminUserDTO), total: Number(total) };
}

export async function createUserByAdmin(
  actorId: string,
  input: { email: string; display_name: string; role: 'learner' | 'admin' },
  ipHash: string,
) {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const row = await getDb().transaction(async (tx) => {
    const r = await insertUser(tx, {
      email: input.email.trim(),
      displayName: input.display_name,
      passwordHash,
      role: input.role,
      mustChangePassword: true,
    });
    await writeAudit(tx, {
      actorUserId: actorId,
      action: 'USER_CREATED_BY_ADMIN',
      entityType: 'user',
      entityId: r.id,
      metadata: { role: input.role },
      ipHash,
    });
    return r;
  });
  return { user: toAdminUserDTO(row), temporaryPassword };
}

/** Jumlah admin aktif selain `exceptId`, dengan baris admin terkunci (mencegah balapan LAST_ADMIN). */
async function otherActiveAdmins(tx: Tx, exceptId: string): Promise<number> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'ACTIVE'), isNull(users.deletedAt)))
    .orderBy(users.id)
    .for('update');
  return rows.filter((r) => r.id !== exceptId).length;
}

async function lockTarget(tx: Tx, userId: string): Promise<UserRow> {
  const [row] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
  if (!row || row.deletedAt) throw new ApiError('NOT_FOUND');
  return row;
}

export async function updateUserByAdmin(
  actorId: string,
  userId: string,
  patch: { role?: 'learner' | 'admin'; status?: 'ACTIVE' | 'DISABLED' },
  ipHash: string,
) {
  if (userId === actorId) throw new ApiError('CANNOT_MODIFY_SELF');
  return getDb().transaction(async (tx) => {
    const target = await lockTarget(tx, userId);
    const newRole = patch.role ?? target.role;
    const newStatus = patch.status ?? target.status;
    if (newRole === target.role && newStatus === target.status) return toAdminUserDTO(target);

    const wasActiveAdmin = target.role === 'admin' && target.status === 'ACTIVE';
    const willBeActiveAdmin = newRole === 'admin' && newStatus === 'ACTIVE';
    if (wasActiveAdmin && !willBeActiveAdmin && (await otherActiveAdmins(tx, userId)) === 0) {
      throw new ApiError('LAST_ADMIN');
    }
    const [updated] = await tx
      .update(users)
      .set({ role: newRole, status: newStatus, tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (newRole !== target.role) {
      await writeAudit(tx, {
        actorUserId: actorId,
        action: 'USER_ROLE_CHANGED',
        entityType: 'user',
        entityId: userId,
        metadata: { from: target.role, to: newRole },
        ipHash,
      });
    }
    if (newStatus !== target.status) {
      await writeAudit(tx, {
        actorUserId: actorId,
        action: 'USER_STATUS_CHANGED',
        entityType: 'user',
        entityId: userId,
        metadata: { from: target.status, to: newStatus },
        ipHash,
      });
    }
    return toAdminUserDTO(updated!);
  });
}

export async function resetPasswordByAdmin(actorId: string, userId: string, ipHash: string) {
  if (userId === actorId) throw new ApiError('CANNOT_MODIFY_SELF');
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await getDb().transaction(async (tx) => {
    await lockTarget(tx, userId);
    await tx
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: true,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await writeAudit(tx, { actorUserId: actorId, action: 'USER_PASSWORD_RESET', entityType: 'user', entityId: userId, ipHash });
  });
  return { temporaryPassword };
}

export async function deleteUserByAdmin(actorId: string, userId: string, ipHash: string): Promise<void> {
  if (userId === actorId) throw new ApiError('CANNOT_MODIFY_SELF');
  await getDb().transaction(async (tx) => {
    const target = await lockTarget(tx, userId);
    if (target.role === 'admin' && target.status === 'ACTIVE' && (await otherActiveAdmins(tx, userId)) === 0) {
      throw new ApiError('LAST_ADMIN');
    }
    await tx
      .update(users)
      .set({ deletedAt: new Date(), status: 'DISABLED', tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await writeAudit(tx, { actorUserId: actorId, action: 'USER_DELETED', entityType: 'user', entityId: userId, ipHash });
  });
}
