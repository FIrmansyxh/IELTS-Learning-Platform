import './_env';
import { sql } from 'drizzle-orm';
import { getDb, closeDb } from '../src/server/db';

async function unlockAllReady() {
  const db = getDb();
  console.log('[unlock] Meng-unlock sub-modul yang materi dan soalnya sudah siap...');

  // Unlock sub-modul yang memiliki learning_materials untuk semua pengguna
  await db.execute(sql`
    UPDATE user_sub_module_progress up
    SET status = 'UNLOCKED', unlock_source = 'ADMIN'
    FROM sub_modules sm
    INNER JOIN learning_materials lm ON sm.id = lm.sub_module_id
    WHERE up.sub_module_id = sm.id AND up.status = 'LOCKED';
  `);

  // Pastikan Tier 1, Tier 2, Tier 3 juga berstatus UNLOCKED
  await db.execute(sql`
    UPDATE user_tier_progress
    SET status = 'UNLOCKED', unlock_source = 'ADMIN'
    WHERE status = 'LOCKED';
  `);

  console.log('[unlock] Selesai! Semua sub-modul dengan materi siap kini berstatus UNLOCKED untuk uji coba manual.');
  await closeDb();
}

unlockAllReady();
