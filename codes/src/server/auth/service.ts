import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import { getDb, type Tx } from '../db';
import { ApiError } from '../http/errors';
import '../hooks-register';
import { userCreatedHooks } from './hooks';
import { toSessionUser, type SessionUser } from './guards';

/** Deteksi pelanggaran indeks unik pg (drizzle membungkus error pg di `cause`). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/**
 * Sisipkan user baru + jalankan userCreatedHooks (dalam transaksi pemanggil). Melempar EMAIL_TAKEN pada
 * pelanggaran unik apa pun (pemanggil memetakannya: profil lokal -> PROFILE_NAME_TAKEN).
 */
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
