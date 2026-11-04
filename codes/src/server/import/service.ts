/**
 * ImportService (SPEC-019): siklus hidup batch di sisi permintaan HTTP (unggah, daftar, item, publish-request, cancel).
 * Pekerjaan berat (validasi, publikasi, rollback) ada di jobs.ts / rollback.ts.
 */
import { and, asc, count, desc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { asyncJobs, importBatchItems, importBatches } from '@/db/schema';
import type { Batch } from '@/contracts/import';
import type { z } from 'zod';
import type { CreateImportBatchFieldsSchema, ItemListQuerySchema, PublishBatchBodySchema } from '@/contracts/import';
import { writeAudit } from '../audit';
import { getDb, type DbOrTx, type Tx } from '../db';
import { ApiError, notFound } from '../http/errors';
import { logger } from '../logger';
import { enqueue } from '../jobs/queue';
import { safeErr } from '../safe-error';
import { getStorage, type StorageDriver } from '../storage';
import { uniqueViolation } from '../assets/pg-errors';
import { checkImportFile, sanitizeFileName } from './file-check';

export const IMPORT_LOCK_KEY = 727019; // berbeda dari kunci advisory AI (727001)
const ACTIVE = ['UPLOADED', 'VALIDATING', 'PUBLISHING'] as const;

export async function lockImports(tx: Tx): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${IMPORT_LOCK_KEY})`);
}

/** Batas diam sebelum batch aktif dianggap macet (queue expire 15 menit x2). */
export const STALL_MS = 30 * 60_000;

/**
 * F-19-02: pulihkan batch aktif yang macet (job terminal tanpa penyelesaian batch, atau tanpa kemajuan > STALL_MS):
 * UPLOADED/VALIDATING -> FAILED, PUBLISHING -> PREVIEW_READY, keduanya dengan `summary.last_error = JOB_STALLED`.
 * Idempoten; dipanggil lazy sebelum pemeriksaan "batch aktif", saat boot worker, dan oleh tugas retensi.
 */
export async function recoverStuckBatches(db: ReturnType<typeof getDb> = getDb(), now: Date = new Date(), stallMs: number = STALL_MS): Promise<number> {
  return db.transaction(async (tx) => {
    await lockImports(tx);
    const rows = await tx.select().from(importBatches).where(inArray(importBatches.status, [...ACTIVE])).for('update');
    let n = 0;
    for (const b of rows) {
      const [job] = await tx.select().from(asyncJobs).where(eq(asyncJobs.importBatchId, b.id)).orderBy(desc(asyncJobs.createdAt), desc(asyncJobs.id)).limit(1);
      const terminal = job !== undefined && (job.status === 'FAILED' || job.status === 'CANCELLED' || job.status === 'SUCCEEDED');
      const since = job ? (job.status === 'RUNNING' ? (job.startedAt ?? job.createdAt) : job.createdAt) : b.createdAt;
      if (!terminal && now.getTime() - since.getTime() <= stallMs) continue;
      const next = b.status === 'PUBLISHING' ? 'PREVIEW_READY' : 'FAILED';
      await tx
        .update(importBatches)
        .set({ status: next, summary: { ...summaryOf(b), last_error: { code: 'JOB_STALLED', message: 'Pekerjaan impor terhenti sebelum selesai; tidak ada perubahan konten yang disimpan. Coba lagi.' } } })
        .where(eq(importBatches.id, b.id));
      if (job && (job.status === 'QUEUED' || job.status === 'RUNNING')) {
        await tx.update(asyncJobs).set({ status: 'FAILED', errorCode: 'JOB_STALLED', finishedAt: now }).where(eq(asyncJobs.id, job.id));
      }
      logger.warn({ batchId: b.id, from: b.status, to: next }, 'import_batch_recovered');
      n++;
    }
    return n;
  });
}

// ------------------------------------------------------------------ DTO
type BatchRow = typeof importBatches.$inferSelect;
type JobRow = typeof asyncJobs.$inferSelect;

export interface BatchSummary {
  warnings?: number;
  noop?: number;
  by_kind?: Record<string, number>;
  last_error?: { code: string; message: string; blockers?: unknown[] } | null;
  csv_kind?: string | null;
  /** F-20-03 (aditif): batch memuat entitas buatan AI yang berubah; FE menampilkan kotak konfirmasi di muka. */
  has_ai_generated?: boolean;
  target_status?: 'DRAFT' | 'PUBLISHED' | null;
  /** F-20-03: admin yang mengonfirmasi telah meninjau konten buatan AI saat meminta publikasi (null bila tidak dikonfirmasi). */
  confirmed_by?: string | null;
  applied_entities?: Array<{ kind: 'MODULE' | 'SUB_MODULE' | 'ASSESSMENT_SET'; id: string; code: string; action: 'CREATE' | 'UPDATE' }>;
  purged_at?: string;
  cancelled_at?: string;
}
export const summaryOf = (b: BatchRow): BatchSummary => ((b.summary ?? {}) as BatchSummary);

async function jobDto(db: DbOrTx, j: JobRow | undefined) {
  if (!j) return null;
  let pos: number | null = null;
  if (j.status === 'QUEUED') {
    const [r] = await db
      .select({ n: count() })
      .from(asyncJobs)
      .where(and(eq(asyncJobs.status, 'QUEUED'), eq(asyncJobs.kind, j.kind), sql`${asyncJobs.createdAt} < ${j.createdAt}`));
    pos = Number(r?.n ?? 0) + 1;
  }
  return {
    id: j.id,
    kind: j.kind as 'IMPORT_VALIDATE' | 'IMPORT_PUBLISH',
    status: j.status,
    stage: null,
    progress_percent: j.progressPercent,
    queue_position: pos,
    error_code: j.errorCode,
    attempt: j.attempt,
  };
}

export async function batchDto(db: DbOrTx, b: BatchRow): Promise<Batch> {
  const s = summaryOf(b);
  const [job] = await db.select().from(asyncJobs).where(eq(asyncJobs.importBatchId, b.id)).orderBy(desc(asyncJobs.createdAt), desc(asyncJobs.id)).limit(1);
  const validated = s.warnings !== undefined;
  return {
    id: b.id,
    format: b.format,
    csv_kind: (s.csv_kind as 'QUESTIONS' | null | undefined) ?? null,
    contract_version: b.format === 'CSV' ? null : b.contractVersion,
    file_name: b.fileName,
    status: b.status,
    total_items: b.totalItems,
    valid_items: b.validItems,
    invalid_items: b.invalidItems,
    created_count: b.createdCount,
    updated_count: b.updatedCount,
    skipped_count: b.skippedCount,
    summary: validated
      ? {
          warnings: s.warnings ?? 0,
          noop: s.noop ?? 0,
          by_kind: s.by_kind ?? {},
          has_ai_generated: s.has_ai_generated ?? false,
          last_error: (s.last_error as Batch['summary'] extends infer X ? (X extends { last_error?: infer L } ? L : never) : never) ?? null,
        }
      : s.last_error
        ? { warnings: 0, noop: 0, by_kind: {}, last_error: s.last_error as never }
        : null,
    target_status: s.target_status ?? null,
    job: await jobDto(db, job),
    created_at: b.createdAt.toISOString(),
    validated_at: b.validatedAt ? b.validatedAt.toISOString() : null,
    published_at: b.publishedAt ? b.publishedAt.toISOString() : null,
  };
}

async function loadBatch(db: DbOrTx, id: string): Promise<BatchRow> {
  const [b] = await db.select().from(importBatches).where(eq(importBatches.id, id));
  if (!b) throw notFound();
  return b;
}

// ------------------------------------------------------------------ pengiriman job
async function dispatch(batchId: string, jobId: string, queue: 'import-validate' | 'import-publish'): Promise<void> {
  const db = getDb();
  try {
    const bossId = await enqueue(queue, { batch_id: batchId, async_job_id: jobId });
    if (bossId) await db.update(asyncJobs).set({ bossJobId: bossId }).where(eq(asyncJobs.id, jobId));
  } catch (e) {
    logger.error({ err: safeErr(e), batchId, queue }, 'import_enqueue_failed');
    await db.update(asyncJobs).set({ status: 'FAILED', errorCode: 'QUEUE_UNAVAILABLE', finishedAt: new Date() }).where(eq(asyncJobs.id, jobId));
    const failedStatus = queue === 'import-validate' ? 'FAILED' : 'PREVIEW_READY';
    const [b] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    await db
      .update(importBatches)
      .set({ status: failedStatus, summary: { ...summaryOf(b!), last_error: { code: 'QUEUE_UNAVAILABLE', message: 'Antrean pekerjaan tidak tersedia.' } } })
      .where(eq(importBatches.id, batchId));
    throw new ApiError('SERVICE_UNAVAILABLE', { status: 503, message: 'Antrean pekerjaan belum siap. Coba lagi sebentar lagi.' });
  }
}

// ------------------------------------------------------------------ unggah
export interface UploadInput {
  fields: z.output<typeof CreateImportBatchFieldsSchema>;
  fileName: string;
  data: Buffer;
}

export async function createBatch(actorId: string, input: UploadInput, ipHash: string | null, storage: StorageDriver = getStorage()): Promise<Batch> {
  const fileName = sanitizeFileName(input.fileName);
  const checked = checkImportFile(input.data, input.fields.format, fileName); // I2 (throws)
  const { createHash } = await import('node:crypto');
  const sha = createHash('sha256').update(input.data).digest('hex');
  const db = getDb();

  await recoverStuckBatches(db);
  const key = await storage.put(input.data, '', 'private/imports');
  let created: { batchId: string; jobId: string };
  try {
    created = await db.transaction(async (tx) => {
      await lockImports(tx);
      const [dup] = await tx
        .select({ id: importBatches.id })
        .from(importBatches)
        .where(and(eq(importBatches.fileSha256, sha), inArray(importBatches.status, ['PREVIEW_READY', 'PUBLISHING', 'PUBLISHED'])));
      if (dup) {
        throw new ApiError('DUPLICATE_BATCH', {
          status: 409,
          message: 'Berkas yang sama sudah diimpor.',
          details: [{ path: 'file', code: 'duplicate_of', message: dup.id }],
        });
      }
      const [active] = await tx.select({ id: importBatches.id }).from(importBatches).where(inArray(importBatches.status, [...ACTIVE])).limit(1);
      if (active) throw new ApiError('IMPORT_IN_PROGRESS', { status: 409, message: 'Masih ada impor lain yang berjalan.' });
      const [b] = await tx
        .insert(importBatches)
        .values({
          adminUserId: actorId,
          format: input.fields.format,
          contractVersion: checked.contractVersion,
          fileName,
          fileSha256: sha,
          storageKey: key,
          status: 'UPLOADED',
          summary: { csv_kind: input.fields.csv_kind ?? null } satisfies BatchSummary,
        })
        .returning({ id: importBatches.id });
      const [job] = await tx.insert(asyncJobs).values({ kind: 'IMPORT_VALIDATE', userId: actorId, importBatchId: b!.id }).returning({ id: asyncJobs.id });
      await writeAudit(tx, {
        actorUserId: actorId,
        action: 'IMPORT_UPLOADED',
        entityType: 'import_batch',
        entityId: b!.id,
        metadata: { batch_id: b!.id, format: input.fields.format, size_bytes: input.data.length, items: checked.itemCount },
        ipHash,
      });
      return { batchId: b!.id, jobId: job!.id };
    });
  } catch (e) {
    await storage.remove(key).catch(() => undefined);
    if (uniqueViolation(e)?.includes('import_batches_file')) {
      throw new ApiError('DUPLICATE_BATCH', { status: 409, message: 'Berkas yang sama sudah diimpor.' });
    }
    throw e;
  }
  await dispatch(created.batchId, created.jobId, 'import-validate');
  return batchDto(db, await loadBatch(db, created.batchId));
}

// ------------------------------------------------------------------ baca
export async function listBatches(q: { status?: BatchRow['status']; page: number; page_size: number }) {
  const db = getDb();
  const where = q.status ? eq(importBatches.status, q.status) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(importBatches).where(where);
  const rows = await db
    .select()
    .from(importBatches)
    .where(where)
    .orderBy(desc(importBatches.createdAt), desc(importBatches.id))
    .limit(q.page_size)
    .offset((q.page - 1) * q.page_size);
  return { total: Number(total), rows: await Promise.all(rows.map((r) => batchDto(db, r))) };
}

export async function getBatch(id: string): Promise<Batch> {
  const db = getDb();
  return batchDto(db, await loadBatch(db, id));
}

type ItemRow = typeof importBatchItems.$inferSelect;
const itemDto = (i: ItemRow) => ({
  row_number: i.rowNumber,
  entity_kind: i.entityKind as 'MODULE' | 'SUB_MODULE' | 'ASSESSMENT_SET' | 'QUESTION',
  entity_code: i.entityCode,
  status: i.status,
  action: i.action,
  errors: ((i.errors ?? []) as unknown[]) as Array<{ path: string; code: string; message: string; severity: 'error' | 'warning' }>,
  content_hash: i.contentHash,
});

export async function listItems(batchId: string, q: z.output<typeof ItemListQuerySchema>) {
  const db = getDb();
  await loadBatch(db, batchId);
  const conds: SQL[] = [eq(importBatchItems.batchId, batchId)];
  if (q.status) conds.push(eq(importBatchItems.status, q.status));
  if (q.action) conds.push(eq(importBatchItems.action, q.action));
  if (q.entity_kind) conds.push(eq(importBatchItems.entityKind, q.entity_kind));
  const where = and(...conds);
  const [{ total }] = await db.select({ total: count() }).from(importBatchItems).where(where);
  const rows = await db.select().from(importBatchItems).where(where).orderBy(asc(importBatchItems.rowNumber)).limit(q.page_size).offset((q.page - 1) * q.page_size);
  return { total: Number(total), rows: rows.map(itemDto) };
}

export async function getItem(batchId: string, rowNumber: number) {
  const db = getDb();
  await loadBatch(db, batchId);
  const [i] = await db.select().from(importBatchItems).where(and(eq(importBatchItems.batchId, batchId), eq(importBatchItems.rowNumber, rowNumber)));
  if (!i) throw notFound();
  const payload = i.payload !== null && typeof i.payload === 'object' && !Array.isArray(i.payload) ? (i.payload as Record<string, unknown>) : null;
  return { ...itemDto(i), payload };
}

// ------------------------------------------------------------------ publish-request & cancel
export async function requestPublish(actorId: string, batchId: string, body: z.output<typeof PublishBatchBodySchema>, ipHash: string | null = null): Promise<Batch> {
  const db = getDb();
  await recoverStuckBatches(db);
  const jobId = await db.transaction(async (tx) => {
    await lockImports(tx);
    const [b] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).for('update');
    if (!b) throw notFound();
    if (b.status !== 'PREVIEW_READY') throw new ApiError('BATCH_NOT_PUBLISHABLE', { status: 409, message: 'Batch belum siap dipublikasikan.' });
    if (b.invalidItems > 0) throw new ApiError('BATCH_HAS_ERRORS', { status: 409, message: 'Batch masih memiliki item galat.' });
    const s = summaryOf(b);
    if ((s.warnings ?? 0) > 0 && body.acknowledge_warnings !== true) {
      throw new ApiError('WARNINGS_NOT_ACKNOWLEDGED', { status: 409, message: 'Peringatan harus diakui terlebih dahulu.' });
    }
    const [other] = await tx.select({ id: importBatches.id }).from(importBatches).where(and(ne(importBatches.id, batchId), inArray(importBatches.status, [...ACTIVE]))).limit(1);
    if (other) throw new ApiError('IMPORT_IN_PROGRESS', { status: 409, message: 'Masih ada impor lain yang berjalan.' });
    // F-20-03 (K2): publikasi konten buatan AI wajib konfirmasi eksplisit. Pemeriksaan cepat dari payload item; job publikasi
    // memeriksa ulang terhadap origin di DB (mencakup set yang hanya disentuh CSV atau berstatus DRAFT).
    if (body.target_status === 'PUBLISHED' && body.confirm_reviewed !== true) {
      const ai = await tx.execute(sql`
        SELECT 1 FROM import_batch_items
        WHERE batch_id = ${batchId}::uuid AND entity_kind IN ('SUB_MODULE', 'ASSESSMENT_SET') AND action IN ('CREATE', 'UPDATE')
          AND payload->>'origin' = 'AI_GENERATED_REVIEWED' LIMIT 1`);
      if (ai.rows.length > 0) {
        throw new ApiError('REVIEW_CONFIRMATION_REQUIRED', { details: [{ path: 'confirm_reviewed', code: 'required', message: 'confirm_reviewed wajib true: batch memuat konten buatan AI.' }] });
      }
    }
    const confirmedBy = body.target_status === 'PUBLISHED' && body.confirm_reviewed === true ? actorId : null;
    await tx
      .update(importBatches)
      .set({ status: 'PUBLISHING', summary: { ...s, target_status: body.target_status, confirmed_by: confirmedBy, last_error: null } })
      .where(eq(importBatches.id, batchId));
    const [job] = await tx.insert(asyncJobs).values({ kind: 'IMPORT_PUBLISH', userId: actorId, importBatchId: batchId }).returning({ id: asyncJobs.id });
    await writeAudit(tx, {
      actorUserId: actorId,
      action: 'IMPORT_PUBLISH_REQUESTED',
      entityType: 'import_batch',
      entityId: batchId,
      metadata: { batch_id: batchId, target_status: body.target_status, ...(confirmedBy ? { confirmed_by: confirmedBy } : {}) },
      ipHash,
    });
    return job!.id;
  });
  await dispatch(batchId, jobId, 'import-publish');
  return batchDto(db, await loadBatch(db, batchId));
}

export async function cancelBatch(actorId: string, batchId: string, ipHash: string | null): Promise<Batch> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await lockImports(tx);
    const [b] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).for('update');
    if (!b) throw notFound();
    if (b.status === 'VALIDATING' || b.status === 'PUBLISHING') {
      // F-19-02: boleh dibatalkan bila job belum/tidak sedang berjalan (antre atau sudah terminal); job RUNNING ditolak.
      const [job] = await tx.select().from(asyncJobs).where(eq(asyncJobs.importBatchId, batchId)).orderBy(desc(asyncJobs.createdAt), desc(asyncJobs.id)).limit(1);
      if (job?.status === 'RUNNING') throw new ApiError('BATCH_NOT_CANCELLABLE', { status: 409, message: 'Batch sedang diproses; tunggu selesai.' });
    } else if (b.status !== 'UPLOADED' && b.status !== 'PREVIEW_READY') {
      throw new ApiError('BATCH_NOT_CANCELLABLE', { status: 409, message: 'Batch tidak dapat dibatalkan pada status ini.' });
    }
    await tx.update(importBatches).set({ status: 'CANCELLED', summary: { ...summaryOf(b), cancelled_at: new Date().toISOString() } }).where(eq(importBatches.id, batchId));
    await tx
      .update(asyncJobs)
      .set({ status: 'CANCELLED', finishedAt: new Date() })
      .where(and(eq(asyncJobs.importBatchId, batchId), inArray(asyncJobs.status, ['QUEUED', 'RUNNING'])));
    await writeAudit(tx, { actorUserId: actorId, action: 'IMPORT_CANCELLED', entityType: 'import_batch', entityId: batchId, metadata: { batch_id: batchId }, ipHash });
  });
  return batchDto(db, await loadBatch(db, batchId));
}
