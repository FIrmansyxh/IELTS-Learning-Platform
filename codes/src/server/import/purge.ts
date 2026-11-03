import { and, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import { importBatchItems, importBatches } from '@/db/schema';
import { getDb, type Db } from '../db';
import { logger } from '../logger';
import { getStorage, type StorageDriver } from '../storage';
import { summaryOf } from './service';

const RETENTION_DAYS = 90;

/**
 * purgeImportBatches (SPEC-019 I7): file asli dan payload item dihapus 90 hari setelah PUBLISHED/CANCELLED
 * (juga ROLLED_BACK/FAILED agar tidak menyimpan berkas selamanya); hitungan batch dipertahankan.
 */
export async function purgeImportBatches(db: Db = getDb(), now: Date = new Date(), storage: StorageDriver = getStorage()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  const rows = await db
    .select()
    .from(importBatches)
    .where(
      and(
        isNotNull(importBatches.storageKey),
        or(
          and(inArray(importBatches.status, ['PUBLISHED', 'ROLLED_BACK']), lt(importBatches.publishedAt, cutoff)),
          and(inArray(importBatches.status, ['CANCELLED', 'FAILED']), lt(importBatches.createdAt, cutoff)),
        ),
      ),
    );
  for (const b of rows) {
    if (b.storageKey) await storage.remove(b.storageKey).catch((e) => logger.warn({ err: String(e), batchId: b.id }, 'import_file_purge_failed'));
    await db.transaction(async (tx) => {
      await tx.update(importBatchItems).set({ payload: sql`'null'::jsonb` }).where(sql`${importBatchItems.batchId} = ${b.id}::uuid`);
      await tx.update(importBatches).set({ storageKey: null, summary: { ...summaryOf(b), purged_at: now.toISOString() } }).where(sql`${importBatches.id} = ${b.id}::uuid`);
    });
  }
  return rows.length;
}
