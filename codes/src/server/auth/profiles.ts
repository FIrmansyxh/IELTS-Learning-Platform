/**
 * Profil lokal (SPEC-025, ADR-005): pengganti login/daftar. Profil = baris `users` tanpa kredensial.
 * Memilih profil menerbitkan cookie sesi; tidak ada kredensial. Keamanan bertumpu pada bind loopback,
 * pemeriksaan Host, dan pemeriksaan Origin (lihat withApi).
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { speakingRecordings, submissions, users } from '@/db/schema';
import { MAX_PROFILES, type ProfileSummary } from '@/contracts/profiles';
import { writeAudit } from '../audit';
import { execute, getDb, isForeignKeyViolation } from '../db';
import { ApiError } from '../http/errors';
import { logger } from '../logger';
import { safeErr } from '../safe-error';
import { getStorage } from '../storage';
import { insertUser } from './service';
import { toSessionUser, type SessionUser } from './guards';

export async function listProfiles(): Promise<ProfileSummary[]> {
  const res = await execute(getDb(), sql`
    SELECT u.id, u.display_name, u.target_band, u.created_at,
           (SELECT count(*) FROM user_sub_module_progress p
              WHERE p.user_id = u.id AND p.status IN ('COMPLETED', 'SKIPPED')) AS completed
    FROM users u
    WHERE u.deleted_at IS NULL AND u.status = 'ACTIVE'
    ORDER BY u.created_at, u.id`);
  type Row = { id: string; display_name: string; target_band: string | null; created_at: Date | string; completed: number };
  return (res.rows as Row[]).map((r) => ({
    id: r.id,
    display_name: r.display_name,
    target_band: r.target_band === null ? null : Number(r.target_band),
    created_at: new Date(r.created_at).toISOString(),
    completed_sub_modules: Number(r.completed),
  }));
}

export async function createProfile(displayName: string, ipHash: string): Promise<SessionUser> {
  return getDb().transaction(async (tx) => {
    const res = await execute(tx, sql`SELECT count(*) AS n FROM users WHERE deleted_at IS NULL AND status = 'ACTIVE'`);
    if (Number((res.rows[0] as { n: number }).n) >= MAX_PROFILES) throw new ApiError('PROFILE_LIMIT_REACHED');
    try {
      const row = await insertUser(tx, { displayName });
      await writeAudit(tx, { actorUserId: row.id, action: 'PROFILE_CREATED', entityType: 'user', entityId: row.id, ipHash });
      return toSessionUser(row);
    } catch (err) {
      throw err;
    }
  });
}

/** Ambil profil aktif untuk diterbitkan sesinya. 404 bila tidak ada/dihapus/nonaktif. */
export async function selectProfile(profileId: string, ipHash: string): Promise<SessionUser> {
  const db = getDb();
  const [row] = await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, profileId), isNull(users.deletedAt), eq(users.status, 'ACTIVE')))
    .returning();
  if (!row) throw new ApiError('NOT_FOUND');
  await writeAudit(db, { actorUserId: row.id, action: 'PROFILE_SELECTED', entityType: 'user', entityId: row.id, ipHash });
  return toSessionUser(row);
}

/** Hapus profil + seluruh progres (kaskade FK) + berkas rekaman. Wajib mengetikkan nama profil. */
export async function deleteProfile(profileId: string, confirmName: string, ipHash: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(and(eq(users.id, profileId), isNull(users.deletedAt)))
    .limit(1);
  if (!row) throw new ApiError('NOT_FOUND');
  if (row.displayName.trim().toLowerCase() !== confirmName.trim().toLowerCase()) throw new ApiError('CONFIRM_NAME_MISMATCH');

  const recs = await db
    .select({ key: speakingRecordings.storageKey })
    .from(speakingRecordings)
    .innerJoin(submissions, eq(submissions.id, speakingRecordings.submissionId))
    .where(eq(submissions.userId, profileId));

  try {
    await db.transaction(async (tx) => {
      await writeAudit(tx, { actorUserId: null, action: 'PROFILE_DELETED', entityType: 'user', entityId: profileId, ipHash });
      await tx.delete(users).where(eq(users.id, profileId));
    });
  } catch (err) {
    // FK RESTRICT (mis. batch impor lama) menahan hapus permanen: hentikan profil secara lunak.
    if (!isForeignKeyViolation(err)) throw err;
    await db
      .update(users)
      .set({
        deletedAt: new Date(),
        status: 'DISABLED',
        displayName: `Profil dihapus ${profileId.slice(0, 4)}`,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, profileId));
  }

  const storage = getStorage();
  for (const r of recs) {
    if (!r.key) continue;
    await storage.remove(r.key).catch((e) => logger.warn({ err: safeErr(e) }, 'profile_delete_recording_remove_failed'));
  }
}
