import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import { getDb, isUniqueViolation, type Tx } from '../db';
import { ApiError } from '../http/errors';
import '../hooks-register';
import { userCreatedHooks } from './hooks';
import { toSessionUser, type SessionUser } from './guards';

export { isUniqueViolation };

/**
 * Sisipkan user baru + jalankan userCreatedHooks (dalam transaksi pemanggil). Melempar PROFILE_NAME_TAKEN pada
 * pelanggaran unik (nama profil).
 */
export async function insertUser(
  tx: Tx,
  v: { displayName: string },
) {
  let row: typeof users.$inferSelect | undefined;
  try {
    // Savepoint: pelanggaran unik tidak merusak transaksi pemanggil sebelum kita melempar galat bisnis.
    row = await tx.transaction(async (sp) => {
      const [r] = await sp.insert(users).values(v).returning();
      return r;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError('PROFILE_NAME_TAKEN');
    throw err;
  }
  if (!row) throw new Error('insert user gagal');
  for (const hook of userCreatedHooks) await hook(tx, { id: row.id });
  return row;
}

/** Ubah nama profil dan/atau target band. Nama harus unik antar profil (tanpa memedulikan huruf besar/kecil). */
export async function updateProfile(
  userId: string,
  input: { display_name?: string; target_band?: number | null },
): Promise<SessionUser> {
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (input.display_name !== undefined) set.displayName = input.display_name;
  if (input.target_band !== undefined) set.targetBand = input.target_band === null ? null : input.target_band.toFixed(1);
  let row: typeof users.$inferSelect | undefined;
  try {
    [row] = await getDb().update(users).set(set).where(eq(users.id, userId)).returning();
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError('PROFILE_NAME_TAKEN');
    throw err;
  }
  if (!row) throw new ApiError('UNAUTHENTICATED');
  return toSessionUser(row);
}
