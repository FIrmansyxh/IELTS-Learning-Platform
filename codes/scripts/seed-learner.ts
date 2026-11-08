import './_env';
import { eq } from 'drizzle-orm';
import { users } from '../src/db/schema';
import { getDb, closeDb } from '../src/server/db';
import { UNUSABLE_PASSWORD_HASH } from '../src/server/auth/profiles';

async function main() {
  const db = getDb();
  try {
    // 1. Update admin mustChangePassword = false for ease of local testing
    await db.update(users).set({ mustChangePassword: false }).where(eq(users.role, 'admin'));
    console.log('[seed-learner] Admin mustChangePassword diatur ke false.');

    // 2. Insert or update learner account
    const learnerEmail = 'pelajar@ielts.test';
    const passwordHash = UNUSABLE_PASSWORD_HASH; // SPEC-025: tanpa password; profil dipilih lewat /pilih-profil

    const [existing] = await db.select().from(users).where(eq(users.email, learnerEmail)).limit(1);
    if (!existing) {
      await db.insert(users).values({
        email: learnerEmail,
        displayName: 'Pelajar IELTS',
        passwordHash,
        role: 'learner',
        targetBand: '6.5',
        mustChangePassword: false,
      });
      console.log('[seed-learner] Akun pelajar berhasil dibuat:', learnerEmail);
    } else {
      await db.update(users).set({
        passwordHash,
        mustChangePassword: false,
      }).where(eq(users.email, learnerEmail));
      console.log('[seed-learner] Akun pelajar diperbarui:', learnerEmail);
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error('[seed-learner] Error:', err);
  process.exit(1);
});

