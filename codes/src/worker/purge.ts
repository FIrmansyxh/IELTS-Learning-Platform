import { sql } from 'drizzle-orm';
import { writeAudit } from '../server/audit';
import { getDb, type Db } from '../server/db';
import { userAnonymizedHooks } from '../server/auth/hooks';
import { purgeImportBatches } from '../server/import/purge';
import { recoverStuckBatches } from '../server/import/service';
import '../server/ai/register';
import { purgeAiRawOutput, purgeRecordings } from '../server/ai/recordings';
import { recoverStuckAiJobs } from '../server/ai/dispatch';

/**
 * Anonimisasi pengguna terhapus > 30 hari (SPEC-002 butir 10). Idempoten: baris yang sudah teranonimisasi
 * tidak dipilih lagi. Mengembalikan jumlah akun yang dianonimisasi pada pemanggilan ini.
 */
export async function anonymizeDeletedUsers(db: Db = getDb()): Promise<number> {
  return db.transaction(async (tx) => {
    const res = await tx.execute(sql`
      SELECT id FROM users
      WHERE deleted_at IS NOT NULL
        AND deleted_at <= now() - interval '30 days'
        AND (email <> 'deleted-' || id::text || '@invalid' OR password_hash <> '!deleted')
      ORDER BY id FOR UPDATE`);
    const ids = (res.rows as Array<{ id: string }>).map((r) => r.id);
    for (const id of ids) {
      await tx.execute(sql`
        UPDATE users SET email = 'deleted-' || id::text || '@invalid', display_name = 'Pengguna dihapus',
               password_hash = '!deleted', target_band = NULL, updated_at = now()
        WHERE id = ${id}::uuid`);
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
  {
    name: 'recoverStuckImportBatches',
    run: async () => {
      await recoverStuckBatches();
    },
  },
  {
    name: 'purgeImportBatches',
    run: async () => {
      await purgeImportBatches();
    },
  },
  // SPEC-012: keluaran mentah LLM dihapus setelah retention.ai_raw_output_days.
  {
    name: 'purgeAiRawOutput',
    run: async () => {
      await purgeAiRawOutput();
    },
  },
  // SPEC-013: berkas rekaman dihapus setelah retention.audio_days (audit RECORDING_PURGED).
  {
    name: 'purgeRecordings',
    run: async () => {
      await purgeRecordings();
    },
  },
  // SPEC-012/013: job AI tertinggal (kedaluwarsa, belum terkirim, AI dimatikan) dipulihkan.
  {
    name: 'recoverStuckAiJobs',
    run: async () => {
      await recoverStuckAiJobs();
    },
  },
];
