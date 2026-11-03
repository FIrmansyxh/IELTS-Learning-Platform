import { and, eq, isNull, sql } from 'drizzle-orm';
import { users } from '@/db/schema';
import { z } from 'zod';
import { writeAudit } from '../audit';
import { getDb } from '../db';
import { insertUser } from './service';
import { hashPassword } from './password';

export type BootstrapResult = { created: false } | { created: true; userId: string };

/** Buat admin pertama (idempoten). Melempar Error berpesan Indonesia bila env tidak valid. */
export async function bootstrapAdmin(env: { ADMIN_EMAIL?: string; ADMIN_INITIAL_PASSWORD?: string }): Promise<BootstrapResult> {
  const db = getDb();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.deletedAt)))
    .limit(1);
  if (existing) return { created: false };

  const email = (env.ADMIN_EMAIL ?? '').trim();
  if (!z.email().safeParse(email).success) throw new Error('ADMIN_EMAIL tidak valid');
  const password = env.ADMIN_INITIAL_PASSWORD ?? '';
  if ([...password.normalize('NFKC')].length < 16) throw new Error('ADMIN_INITIAL_PASSWORD minimal 16 karakter');

  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    // Kunci advisory: dua proses bootstrap serentak tidak membuat dua admin.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('admin-bootstrap'))`);
    const [again] = await tx.select({ id: users.id }).from(users).where(and(eq(users.role, 'admin'), isNull(users.deletedAt))).limit(1);
    if (again) return { created: false } as const;
    const row = await insertUser(tx, { email, displayName: 'Admin', passwordHash, role: 'admin', mustChangePassword: true });
    await writeAudit(tx, { action: 'ADMIN_BOOTSTRAPPED', entityType: 'user', entityId: row.id });
    return { created: true, userId: row.id } as const;
  });
}
