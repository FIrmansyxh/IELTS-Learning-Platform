import { and, eq, isNull, sql } from 'drizzle-orm';
import { signupInvites, users } from '@/db/schema';
import type { RegisterRequest } from '@/contracts/auth';
import { writeAudit, maskEmail } from '../audit';
import { getDb, type Tx } from '../db';
import { ApiError, validationError } from '../http/errors';
import { getSetting } from '../settings/service';
import '../hooks-register';
import { userCreatedHooks } from './hooks';
import { hashInviteCode } from './invite-code';
import { checkPasswordPolicy, dummyVerify, hashPassword, verifyPassword } from './password';
import { toSessionUser, type SessionUser } from './guards';

const POLICY_MESSAGES: Record<string, string> = {
  password_too_short: 'Password minimal 10 karakter.',
  password_too_long: 'Password maksimal 128 karakter.',
  password_too_common: 'Password terlalu umum.',
  password_same_as_email: 'Password tidak boleh sama dengan email.',
  password_unchanged: 'Password baru harus berbeda dari password saat ini.',
};

/** Deteksi pelanggaran indeks unik pg (drizzle membungkus error pg di `cause`). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

export function policyError(path: string, code: string): ApiError {
  return validationError(path, code, POLICY_MESSAGES[code] ?? 'Nilai tidak valid.');
}

/** Sisipkan user baru + jalankan userCreatedHooks (dalam transaksi pemanggil). Melempar EMAIL_TAKEN. */
export async function insertUser(
  tx: Tx,
  v: {
    email: string;
    displayName: string;
    passwordHash: string;
    role: 'learner' | 'admin';
    mustChangePassword: boolean;
  },
) {
  let row: typeof users.$inferSelect | undefined;
  try {
    // Savepoint: pelanggaran unik tidak merusak transaksi pemanggil sebelum kita melempar galat bisnis.
    row = await tx.transaction(async (sp) => {
      const [r] = await sp.insert(users).values(v).returning();
      return r;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError('EMAIL_TAKEN');
    throw err;
  }
  if (!row) throw new Error('insert user gagal');
  for (const hook of userCreatedHooks) await hook(tx, { id: row.id, role: row.role });
  return row;
}

export async function registerUser(input: RegisterRequest, ipHash: string): Promise<SessionUser> {
  const db = getDb();
  const email = input.email.trim();
  const policy = checkPasswordPolicy(input.password, email);
  if (policy) throw policyError('password', policy);

  const mode = await getSetting<string>(db, 'signup.mode');
  if (mode === 'closed') throw new ApiError('SIGNUP_CLOSED');
  if (mode === 'invite' && !input.invite_code) throw new ApiError('INVITE_INVALID');

  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    let inviteId: string | null = null;
    if (mode === 'invite') {
      // Klaim atomik: hanya satu pemanggil yang berhasil untuk satu kode.
      const claimed = await tx
        .update(signupInvites)
        .set({ usedAt: sql`now()` })
        .where(
          and(
            eq(signupInvites.codeHash, hashInviteCode(input.invite_code!)),
            isNull(signupInvites.usedAt),
            isNull(signupInvites.revokedAt),
            sql`${signupInvites.expiresAt} > now()`,
          ),
        )
        .returning({ id: signupInvites.id });
      if (!claimed[0]) throw new ApiError('INVITE_INVALID');
      inviteId = claimed[0].id;
    }
    const row = await insertUser(tx, {
      email,
      displayName: input.display_name,
      passwordHash,
      role: 'learner',
      mustChangePassword: false,
    });
    if (inviteId) await tx.update(signupInvites).set({ usedBy: row.id }).where(eq(signupInvites.id, inviteId));
    await writeAudit(tx, {
      actorUserId: row.id,
      action: 'AUTH_REGISTER',
      entityType: 'user',
      entityId: row.id,
      metadata: { mode, via_invite: inviteId !== null },
      ipHash,
    });
    return toSessionUser(row);
  });
}

const LOCK_WINDOW_MS = 15 * 60_000;

export async function loginUser(email: string, password: string, ipHash: string): Promise<SessionUser> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = lower(${email})`, isNull(users.deletedAt)))
    .limit(1);

  const fail = async (reason: string, actor: string | null) => {
    await writeAudit(db, {
      actorUserId: actor,
      action: 'AUTH_LOGIN_FAILED',
      entityType: 'user',
      entityId: actor,
      metadata: { reason, email_masked: maskEmail(email) },
      ipHash,
    });
    return new ApiError('INVALID_CREDENTIALS');
  };

  if (!row) {
    await dummyVerify(password);
    throw await fail('unknown_email', null);
  }
  const locked = row.lockedUntil !== null && row.lockedUntil.getTime() > Date.now();
  if (locked || row.status !== 'ACTIVE') {
    await dummyVerify(password); // waktu respons seragam
    throw await fail(locked ? 'locked' : 'disabled', row.id);
  }

  const ok = await verifyPassword(row.passwordHash, password);
  if (!ok) {
    await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(users).where(eq(users.id, row.id)).for('update');
      if (!cur) return;
      const stale =
        cur.lastFailedLoginAt === null || Date.now() - cur.lastFailedLoginAt.getTime() > LOCK_WINDOW_MS;
      const count = Math.min(stale ? 1 : cur.failedLoginCount + 1, 30);
      const lockMinutes = count >= 5 ? Math.min(15 * 2 ** (count - 5), 60) : 0;
      await tx
        .update(users)
        .set({
          failedLoginCount: count,
          lastFailedLoginAt: new Date(),
          lockedUntil: lockMinutes > 0 ? new Date(Date.now() + lockMinutes * 60_000) : cur.lockedUntil,
          updatedAt: new Date(),
        })
        .where(eq(users.id, row.id));
      if (lockMinutes > 0) {
        await writeAudit(tx, {
          actorUserId: row.id,
          action: 'AUTH_LOCKOUT',
          entityType: 'user',
          entityId: row.id,
          metadata: { failed_count: count, lock_minutes: lockMinutes },
          ipHash,
        });
      }
    });
    throw await fail('bad_password', row.id);
  }

  const [updated] = await db.transaction(async (tx) => {
    const r = await tx
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, row.id))
      .returning();
    await writeAudit(tx, { actorUserId: row.id, action: 'AUTH_LOGIN_SUCCESS', entityType: 'user', entityId: row.id, ipHash });
    return r;
  });
  return toSessionUser(updated!);
}

export async function logoutUser(userId: string, ipHash: string): Promise<void> {
  await writeAudit(getDb(), { actorUserId: userId, action: 'AUTH_LOGOUT', entityType: 'user', entityId: userId, ipHash });
}

export async function changePassword(
  userId: string,
  input: { current_password: string; new_password: string },
  ipHash: string,
): Promise<SessionUser> {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw new ApiError('UNAUTHENTICATED');
  const policy = checkPasswordPolicy(input.new_password, row.email);
  if (policy) throw policyError('new_password', policy);
  if (input.new_password.normalize('NFKC') === input.current_password.normalize('NFKC')) {
    throw policyError('new_password', 'password_unchanged');
  }
  if (!(await verifyPassword(row.passwordHash, input.current_password))) {
    await writeAudit(db, { actorUserId: userId, action: 'AUTH_PASSWORD_CHANGE_FAILED', entityType: 'user', entityId: userId, ipHash });
    throw new ApiError('CURRENT_PASSWORD_INCORRECT');
  }
  const passwordHash = await hashPassword(input.new_password);
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({
        passwordHash,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    await writeAudit(tx, { actorUserId: userId, action: 'AUTH_PASSWORD_CHANGED', entityType: 'user', entityId: userId, ipHash });
    return toSessionUser(updated!);
  });
}

export async function updateProfile(
  userId: string,
  input: { display_name?: string; target_band?: number | null },
): Promise<SessionUser> {
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (input.display_name !== undefined) set.displayName = input.display_name;
  if (input.target_band !== undefined) set.targetBand = input.target_band === null ? null : input.target_band.toFixed(1);
  const [row] = await getDb().update(users).set(set).where(eq(users.id, userId)).returning();
  if (!row) throw new ApiError('UNAUTHENTICATED');
  return toSessionUser(row);
}

export async function getSignupMode(): Promise<'open' | 'invite' | 'closed'> {
  return (await getSetting<string>(getDb(), 'signup.mode')) as 'open' | 'invite' | 'closed';
}
