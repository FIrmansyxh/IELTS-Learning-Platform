import { sql } from 'drizzle-orm';
import { writeAudit } from '../audit';
import { NOW, execute, getDb, type Db } from '../db';
import { userAnonymizedHooks } from '../auth/hooks';

/**
 * Anonimisasi pengguna terhapus > 30 hari (SPEC-002 butir 10). Idempoten: baris yang sudah teranonimisasi
 * tidak dipilih lagi. Mengembalikan jumlah akun yang dianonimisasi pada pemanggilan ini.
 */
export async function anonymizeDeletedUsers(db: Db = getDb()): Promise<number> {
  return db.transaction(async (tx) => {
    const res = await execute(tx, sql`
      SELECT id FROM users
      WHERE deleted_at IS NOT NULL
        AND deleted_at <= ${NOW} - 30 * 86400000
        AND display_name <> 'Pengguna dihapus'
      ORDER BY id`);
    const ids = (res.rows as Array<{ id: string }>).map((r) => r.id);
    for (const id of ids) {
      await execute(tx, sql`UPDATE users SET display_name = 'Pengguna dihapus', target_band = NULL, updated_at = ${NOW} WHERE id = ${id}`);
      for (const hook of userAnonymizedHooks) await hook(tx, id);
      await writeAudit(tx, { action: 'USER_ANONYMIZED', entityType: 'user', entityId: id });
    }
    return ids.length;
  });
}

/** Registri tugas retensi (_api-contract.md bagian 7). Spec 012/013/019 menambah entri. */
export const purgeTasks: Array<{ name: string; run: () => Promise<void> }> = [
  {
    name: 'anonymizeDeletedUsers',
    run: async () => {
      await anonymizeDeletedUsers();
    },
  },
];
