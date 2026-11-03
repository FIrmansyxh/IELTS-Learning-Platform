/** npm run user:reset-password -- <email>  (security-standards 1.2). Mencetak password sementara SEKALI. */
import './_env';
import { and, eq, isNull, sql } from 'drizzle-orm';

process.env.DATABASE_URL ??= process.env.DATABASE_MIGRATOR_URL;

async function main() {
  const emailArg = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? process.argv[process.argv.indexOf('--email') + 1];
  if (!emailArg) {
    console.error('Pemakaian: npm run user:reset-password -- <email>');
    process.exit(1);
  }
  const { getDb, closeDb } = await import('../src/server/db');
  const { users } = await import('../src/db/schema');
  const { generateTemporaryPassword, hashPassword } = await import('../src/server/auth/password');
  const { writeAudit } = await import('../src/server/audit');
  const db = getDb();
  try {
    const temp = generateTemporaryPassword();
    const hash = await hashPassword(temp);
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(users)
        .set({
          passwordHash: hash,
          mustChangePassword: true,
          tokenVersion: sql`${users.tokenVersion} + 1`,
          failedLoginCount: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(and(sql`lower(${users.email}) = lower(${emailArg})`, isNull(users.deletedAt), eq(users.status, 'ACTIVE')))
        .returning({ id: users.id });
      if (rows[0]) await writeAudit(tx, { action: 'USER_PASSWORD_RESET', entityType: 'user', entityId: rows[0].id, metadata: { via: 'cli' } });
      return rows[0];
    });
    if (!updated) {
      console.error('Pengguna aktif dengan email itu tidak ditemukan.');
      process.exit(1);
    }
    console.log(`Password sementara (hanya ditampilkan sekali): ${temp}`);
  } finally {
    await closeDb();
  }
}

main().catch(() => {
  console.error('Reset password gagal.');
  process.exit(1);
});
