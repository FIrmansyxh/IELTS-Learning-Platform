/** Rekaman Speaking (SPEC-013): retensi, penghapusan berkas, purge terjadwal, dan hook anonimisasi. */
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { speakingRecordings, submissions } from '@/db/schema';
import { writeAudit } from '../audit';
import { getDb, type DbOrTx, type Tx } from '../db';
import { logger } from '../logger';
import { safeErr } from '../safe-error';
import { getSetting } from '../settings/service';
import { getStorage, type StorageDriver } from '../storage';

export async function removeFileQuietly(storage: StorageDriver, key: string | null | undefined): Promise<void> {
  if (!key) return;
  try {
    await storage.remove(key);
  } catch (e) {
    logger.warn({ err: safeErr(e) }, 'recording_file_remove_failed'); // tanpa path
  }
}

/** Tetapkan `retention_expires_at` (sekali) untuk rekaman submission yang masih tersimpan. Dipanggil pada status terminal. */
export async function setRetention(tx: DbOrTx, submissionId: string): Promise<void> {
  const days = await getSetting<number>(tx, 'retention.audio_days');
  await tx
    .update(speakingRecordings)
    .set({ retentionExpiresAt: sql`now() + make_interval(days => ${days})` })
    .where(and(eq(speakingRecordings.submissionId, submissionId), isNull(speakingRecordings.retentionExpiresAt), isNull(speakingRecordings.purgedAt)));
}

/**
 * Purge terjadwal: rekaman dengan `retention_expires_at < now()` dan belum dipurge -> berkas fisik dihapus,
 * `storage_key=NULL`, `purged_at=now()`, satu baris audit `RECORDING_PURGED` per proses dengan `metadata.count`.
 */
export async function purgeRecordings(db = getDb(), storage: StorageDriver = getStorage()): Promise<number> {
  const due = await db
    .select({ id: speakingRecordings.id, key: speakingRecordings.storageKey })
    .from(speakingRecordings)
    .where(and(lt(speakingRecordings.retentionExpiresAt, sql`now()`), isNull(speakingRecordings.purgedAt)));
  if (due.length === 0) return 0;
  for (const r of due) await removeFileQuietly(storage, r.key);
  const ids = due.map((r) => r.id);
  await db.transaction(async (tx) => {
    await tx.update(speakingRecordings).set({ storageKey: null, purgedAt: sql`now()` }).where(inArray(speakingRecordings.id, ids));
    await writeAudit(tx, { action: 'RECORDING_PURGED', entityType: 'speaking_recording', metadata: { count: ids.length } });
  });
  return ids.length;
}

/** `userAnonymizedHooks` (SPEC-002): hapus semua berkas rekaman milik pengguna dan tandai purged. */
export async function deleteUserRecordings(tx: Tx, userId: string, storage: StorageDriver = getStorage()): Promise<void> {
  const rows = await tx
    .select({ id: speakingRecordings.id, key: speakingRecordings.storageKey })
    .from(speakingRecordings)
    .innerJoin(submissions, eq(submissions.id, speakingRecordings.submissionId))
    .where(and(eq(submissions.userId, userId), isNull(speakingRecordings.purgedAt)));
  for (const r of rows) await removeFileQuietly(storage, r.key);
  if (rows.length > 0) {
    await tx
      .update(speakingRecordings)
      .set({ storageKey: null, purgedAt: sql`now()` })
      .where(inArray(speakingRecordings.id, rows.map((r) => r.id)));
  }
}

/** Retensi keluaran mentah LLM: `raw_output=NULL` bila `created_at < now() - retention.ai_raw_output_days`. */
export async function purgeAiRawOutput(db = getDb()): Promise<number> {
  const days = await getSetting<number>(db, 'retention.ai_raw_output_days');
  const r = await db.execute(
    sql`UPDATE ai_evaluations SET raw_output = NULL WHERE raw_output IS NOT NULL AND created_at < now() - make_interval(days => ${days})`,
  );
  return r.rowCount ?? 0;
}
