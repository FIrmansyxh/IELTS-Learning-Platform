/**
 * Handler job impor (SPEC-019): `import-validate` (I3) dan `import-publish` (I5). Idempoten terhadap pengulangan pg-boss:
 * validasi menimpa item lama; publikasi satu transaksi sehingga tidak ada penulisan parsial.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import { asyncJobs, importBatchItems, importBatches, learningMaterials, subModules, assessmentSets } from '@/db/schema';
import { writeAudit } from '../audit';
import { getDb, type Tx } from '../db';
import { ApiError } from '../http/errors';
import { logger } from '../logger';
import { safeErr } from '../safe-error';
import { getStorage, type StorageDriver } from '../storage';
import { activeAttemptSetIds, lockSets } from '../content/active-attempts';
import { applyContentPlan, type Touched } from '../content/apply';
import { changeStatus, computeBlockers, type Blocker, type PublishEntityType } from '../content/publish';
import { checkImportFile } from './file-check';
import { evaluate, summarizeItems, type CsvSetPlan, type Evaluation } from './evaluate';
import { lockImports, summaryOf, type BatchSummary } from './service';
import { applyCsvPlans } from './csv-apply';

const NIL_UUID = '00000000-0000-4000-8000-000000000000';
const CHUNK = 400;

async function finishJob(jobId: string | undefined, batchId: string, status: 'SUCCEEDED' | 'FAILED', errorCode?: string) {
  const db = getDb();
  const set = { status, finishedAt: new Date(), progressPercent: status === 'SUCCEEDED' ? 100 : 0, errorCode: errorCode ?? null };
  if (jobId) await db.update(asyncJobs).set(set).where(eq(asyncJobs.id, jobId));
  else await db.update(asyncJobs).set(set).where(eq(asyncJobs.importBatchId, batchId));
}

async function startJob(tx: Tx, jobId: string | undefined, batchId: string, kind: 'IMPORT_VALIDATE' | 'IMPORT_PUBLISH') {
  const cond = jobId ? eq(asyncJobs.id, jobId) : eq(asyncJobs.importBatchId, batchId);
  const rows = await tx.select().from(asyncJobs).where(cond);
  const job = rows.filter((r) => r.kind === kind && (r.status === 'QUEUED' || r.status === 'RUNNING')).pop();
  if (job) {
    await tx
      .update(asyncJobs)
      .set({ status: 'RUNNING', startedAt: new Date(), attempt: job.attempt + 1, progressPercent: 10 })
      .where(eq(asyncJobs.id, job.id));
  }
}

async function readFile(storage: StorageDriver, key: string | null): Promise<Buffer> {
  if (!key) throw new ApiError('NOT_FOUND', { status: 410, message: 'Berkas impor sudah dihapus.' });
  return storage.get(key);
}

// ------------------------------------------------------------------ validasi
export async function runImportValidate(batchId: string, jobId?: string, storage: StorageDriver = getStorage()): Promise<'done' | 'skipped'> {
  const db = getDb();
  const batch = await db.transaction(async (tx) => {
    await lockImports(tx);
    const [b] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).for('update');
    if (!b || (b.status !== 'UPLOADED' && b.status !== 'VALIDATING')) return null;
    await tx.update(importBatches).set({ status: 'VALIDATING' }).where(eq(importBatches.id, batchId));
    await startJob(tx, jobId, batchId, 'IMPORT_VALIDATE');
    return b;
  });
  if (!batch) return 'skipped';

  let evaluation: Evaluation | null = null;
  let fatal: { code: string; message: string } | null = null;
  try {
    const buf = await readFile(storage, batch.storageKey);
    const checked = checkImportFile(buf, batch.format, batch.fileName);
    evaluation = await db.transaction((tx) => evaluate(tx, checked));
    if (evaluation.fileError) fatal = evaluation.fileError;
  } catch (e) {
    if (e instanceof ApiError) fatal = { code: e.details?.[0]?.code?.toUpperCase() ?? e.code, message: e.details?.[0]?.message ?? e.message };
    else {
      logger.error({ err: safeErr(e), batchId }, 'import_validate_failed');
      fatal = { code: 'INTERNAL_ERROR', message: 'Validasi gagal karena galat teknis.' };
    }
  }

  const prev = summaryOf(batch);
  if (fatal || !evaluation) {
    await db
      .update(importBatches)
      .set({ status: 'FAILED', validatedAt: new Date(), summary: { ...prev, last_error: fatal ?? { code: 'INTERNAL_ERROR', message: 'Validasi gagal.' } } })
      .where(eq(importBatches.id, batchId));
    await finishJob(jobId, batchId, 'FAILED', fatal?.code.slice(0, 40));
    return 'done';
  }

  const sum = summarizeItems(evaluation.items);
  await db.transaction(async (tx) => {
    await lockImports(tx);
    const [cur] = await tx.select({ status: importBatches.status }).from(importBatches).where(eq(importBatches.id, batchId)).for('update');
    if (cur?.status !== 'VALIDATING') return; // dibatalkan saat berjalan
    await tx.delete(importBatchItems).where(eq(importBatchItems.batchId, batchId));
    for (let i = 0; i < evaluation!.items.length; i += CHUNK) {
      await tx.insert(importBatchItems).values(
        evaluation!.items.slice(i, i + CHUNK).map((it) => ({
          batchId,
          rowNumber: it.rowNumber,
          entityKind: it.entityKind,
          entityCode: it.entityCode,
          status: it.status,
          action: it.action,
          errors: it.errors,
          payload: it.payload ?? {},
          contentHash: it.contentHash,
        })),
      );
    }
    await tx
      .update(importBatches)
      .set({
        status: 'PREVIEW_READY',
        totalItems: sum.total,
        validItems: sum.valid,
        invalidItems: sum.invalid,
        validatedAt: new Date(),
        summary: { ...prev, warnings: sum.warnings, noop: sum.noop, by_kind: sum.by_kind, has_ai_generated: sum.has_ai_generated, last_error: null },
      })
      .where(eq(importBatches.id, batchId));
    await writeAudit(tx, {
      actorUserId: batch.adminUserId,
      action: 'IMPORT_VALIDATED',
      entityType: 'import_batch',
      entityId: batchId,
      metadata: { batch_id: batchId, total: sum.total, invalid: sum.invalid, warnings: sum.warnings },
    });
  });
  await finishJob(jobId, batchId, 'SUCCEEDED');
  return 'done';
}

// ------------------------------------------------------------------ publikasi
class PublishAbort extends Error {
  constructor(
    readonly kind: 'BLOCKED' | 'VALIDATION_CHANGED' | 'REVIEW_REQUIRED',
    readonly detail: unknown,
  ) {
    super(kind);
  }
}

const PUBLISH_ORDER = (t: Touched) => (t.kind === 'ASSESSMENT_SET' ? (t.setType === 'TIER_BOSS_EXAM' ? 1 : 0) : t.kind === 'SUB_MODULE' ? 2 : 3);

/** Publikasikan entitas terdampak (+ modul induk) lewat PublishService; mengembalikan seluruh penghalang. */
async function publishTouched(tx: Tx, touched: Touched[], actorId: string, confirmedBy: string | null): Promise<Blocker[]> {
  // F-20-03 (K2): konten buatan AI yang akan BERUBAH menjadi PUBLISHED wajib dikonfirmasi saat meminta publikasi.
  if (!confirmedBy) {
    const aiPending: string[] = [];
    for (const t of touched) {
      if (t.kind === 'SUB_MODULE') {
        const [r] = await tx
          .select({ origin: learningMaterials.origin, status: subModules.status })
          .from(subModules)
          .leftJoin(learningMaterials, eq(learningMaterials.subModuleId, subModules.id))
          .where(eq(subModules.id, t.id));
        if (r?.origin === 'AI_GENERATED_REVIEWED' && r.status !== 'PUBLISHED') aiPending.push(t.code);
      } else if (t.kind === 'ASSESSMENT_SET') {
        const [r] = await tx.select({ origin: assessmentSets.origin, status: assessmentSets.status }).from(assessmentSets).where(eq(assessmentSets.id, t.id));
        if (r?.origin === 'AI_GENERATED_REVIEWED' && r.status !== 'PUBLISHED') aiPending.push(t.code);
      }
    }
    if (aiPending.length) throw new PublishAbort('REVIEW_REQUIRED', aiPending);
  }
  const all = [...touched];
  const haveMods = new Set(all.filter((t) => t.kind === 'MODULE').map((t) => t.id));
  const subIds = all.filter((t) => t.kind === 'SUB_MODULE').map((t) => t.id);
  const setIds = all.filter((t) => t.kind === 'ASSESSMENT_SET').map((t) => t.id);
  const parents = [
    ...(await tx.selectDistinct({ id: subModules.moduleId }).from(subModules).where(inArray(subModules.id, subIds.length ? subIds : [NIL_UUID]))),
    ...(await tx.selectDistinct({ id: assessmentSets.moduleId }).from(assessmentSets).where(inArray(assessmentSets.id, setIds.length ? setIds : [NIL_UUID]))),
  ];
  for (const p of parents) {
    if (p.id && !haveMods.has(p.id)) {
      haveMods.add(p.id);
      all.push({ kind: 'MODULE', id: p.id, code: p.id, action: 'NOOP' });
    }
  }
  const blockers: Blocker[] = [];
  const codeById = new Map(all.map((t) => [t.id, t.code]));
  for (const t of all.sort((a, b) => PUBLISH_ORDER(a) - PUBLISH_ORDER(b))) {
    try {
      const r = await changeStatus(tx, t.kind as PublishEntityType, t.id, 'PUBLISHED', { userId: actorId });
      if (!r.published) blockers.push(...r.blockers);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      blockers.push({ code: e.code as Blocker['code'], entity_type: t.kind as PublishEntityType, entity_id: t.id, detail: e.message });
    }
  }
  return decorateBlockers(blockers, codeById);
}

function decorateBlockers(blockers: Blocker[], codeById: Map<string, string>): Blocker[] {
  return blockers.map((b) => {
    const asset = /\(([^)]+)\)$/.exec(b.detail)?.[1];
    return { ...b, message: b.detail, entity_code: codeById.get(b.entity_id) ?? null, ...(asset ? { asset_code: asset } : {}) } as Blocker;
  });
}

/**
 * F-19-01: entitas yang SUDAH `PUBLISHED` dan di-UPDATE batch tetap tayang; penghalang lisensi/isi (aset UNVERIFIED,
 * video baru, dst.) dihitung ulang apa pun `target_status`, sehingga draf tidak menjadi jalan pintas.
 */
async function blockersForPublishedUpdates(tx: Tx, touched: Touched[]): Promise<Blocker[]> {
  const updates = touched.filter((t) => t.action === 'UPDATE' && (t.kind === 'SUB_MODULE' || t.kind === 'ASSESSMENT_SET'));
  const out: Blocker[] = [];
  const codeById = new Map(touched.map((t) => [t.id, t.code]));
  for (const t of updates) {
    const table = t.kind === 'SUB_MODULE' ? subModules : assessmentSets;
    const [row] = await tx.select({ status: table.status }).from(table).where(eq(table.id, t.id));
    if (row?.status !== 'PUBLISHED') continue;
    out.push(...(await computeBlockers(tx, t.kind as PublishEntityType, t.id)));
  }
  return decorateBlockers(out, codeById);
}

export async function runImportPublish(batchId: string, jobId?: string, storage: StorageDriver = getStorage()): Promise<'done' | 'skipped'> {
  const db = getDb();
  const batch = await db.transaction(async (tx) => {
    await lockImports(tx);
    const [b] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).for('update');
    if (!b || b.status !== 'PUBLISHING') return null;
    await startJob(tx, jobId, batchId, 'IMPORT_PUBLISH');
    return b;
  });
  if (!batch) {
    // Sudah PUBLISHED (pengulangan job): selesaikan job tanpa menulis ulang.
    const [cur] = await db.select({ status: importBatches.status }).from(importBatches).where(eq(importBatches.id, batchId));
    if (cur?.status === 'PUBLISHED') await finishJob(jobId, batchId, 'SUCCEEDED');
    return 'skipped';
  }
  const prev = summaryOf(batch);
  const target = prev.target_status ?? 'DRAFT';
  // F-19-03: aktor = admin yang menekan Publikasikan (async_jobs.user_id), bukan pengunggah.
  const [pubJob] = jobId ? await db.select({ userId: asyncJobs.userId }).from(asyncJobs).where(eq(asyncJobs.id, jobId)) : [];
  const actorId = pubJob?.userId ?? batch.adminUserId;

  try {
    const buf = await readFile(storage, batch.storageKey);
    const checked = checkImportFile(buf, batch.format, batch.fileName);
    await db.transaction(async (tx) => {
      await lockImports(tx);
      const ev = await evaluate(tx, checked);
      if (ev.fileError || ev.items.some((i) => i.status === 'INVALID')) {
        const bad = ev.items.find((i) => i.status === 'INVALID')?.errors.find((e) => e.severity === 'error');
        throw new PublishAbort('VALIDATION_CHANGED', ev.fileError?.code ?? (bad ? `${bad.code} @ ${bad.path}` : 'invalid'));
      }
      let touched: Touched[] = [];
      if (ev.jsonPlan) {
        const applied = await applyContentPlan(tx, ev.jsonPlan, { actorUserId: actorId, importBatchId: batchId });
        touched = applied.touched;
      } else if (ev.csvPlans) {
        touched = await applyCsvPlans(tx, ev.csvPlans as CsvSetPlan[], { actorUserId: actorId, importBatchId: batchId });
      }
      // F-20-04: pagar set berjalan diulang SETELAH apply dengan baris set terkunci (menutup jendela evaluasi -> commit);
      // definisi "hidup" sama dengan kurasi K3, termasuk set induk/anak Boss.
      const updatedSets = touched.filter((t) => t.kind === 'ASSESSMENT_SET' && t.action === 'UPDATE').map((t) => t.id);
      if (updatedSets.length) {
        await lockSets(tx, updatedSets);
        if ((await activeAttemptSetIds(tx, updatedSets)).size > 0) throw new PublishAbort('VALIDATION_CHANGED', 'set_has_active_attempts');
      }
      const stillLive = await blockersForPublishedUpdates(tx, touched);
      if (stillLive.length) throw new PublishAbort('BLOCKED', stillLive);
      if (target === 'PUBLISHED') {
        const blockers = await publishTouched(tx, touched, actorId, prev.confirmed_by ?? null);
        if (blockers.length) throw new PublishAbort('BLOCKED', blockers);
      }

      const idByCode = new Map(touched.map((t) => [t.code, t.id]));
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const it of ev.items) {
        const noop = it.action === 'NOOP';
        if (it.action === 'CREATE') created++;
        else if (it.action === 'UPDATE') updated++;
        else skipped++;
        const setKey = it.entityKind === 'QUESTION' ? (it.payload as { set_type: string; scope_code: string }) : null;
        const code = setKey ? `${setKey.set_type}:${setKey.scope_code}` : (it.entityCode ?? '');
        await tx
          .update(importBatchItems)
          .set({ status: noop ? 'SKIPPED' : 'APPLIED', appliedEntityId: idByCode.get(code) ?? null })
          .where(sql`${importBatchItems.batchId} = ${batchId}::uuid AND ${importBatchItems.rowNumber} = ${it.rowNumber}`);
      }
      const appliedEntities = touched
        .filter((t) => t.action !== 'NOOP')
        .map((t) => ({ kind: t.kind, id: t.id, code: t.code, action: t.action as 'CREATE' | 'UPDATE' }));
      await tx
        .update(importBatches)
        .set({
          status: 'PUBLISHED',
          publishedAt: new Date(),
          createdCount: created,
          updatedCount: updated,
          skippedCount: skipped,
          summary: { ...prev, last_error: null, applied_entities: appliedEntities } satisfies BatchSummary,
        })
        .where(eq(importBatches.id, batchId));
      await writeAudit(tx, {
        actorUserId: actorId,
        action: 'IMPORT_PUBLISHED',
        entityType: 'import_batch',
        entityId: batchId,
        metadata: { batch_id: batchId, target_status: target, created, updated, skipped, ...(prev.confirmed_by ? { confirmed_by: prev.confirmed_by } : {}) },
      });
    });
    await finishJob(jobId, batchId, 'SUCCEEDED');
  } catch (e) {
    if (e instanceof PublishAbort && e.kind === 'BLOCKED') {
      const blockers = e.detail as Blocker[];
      await db
        .update(importBatches)
        .set({
          status: 'PREVIEW_READY',
          summary: { ...prev, last_error: { code: 'PUBLISH_BLOCKED', message: 'Publikasi terhalang; tidak ada perubahan yang disimpan.', blockers } },
        })
        .where(eq(importBatches.id, batchId));
      await finishJob(jobId, batchId, 'FAILED', 'PUBLISH_BLOCKED');
    } else if (e instanceof PublishAbort && e.kind === 'REVIEW_REQUIRED') {
      // F-20-03: batch kembali ke PREVIEW_READY agar Admin dapat meminta ulang dengan `confirm_reviewed: true`.
      await db
        .update(importBatches)
        .set({
          status: 'PREVIEW_READY',
          summary: { ...prev, last_error: { code: 'REVIEW_CONFIRMATION_REQUIRED', message: 'Konten buatan AI wajib dikonfirmasi telah ditinjau (confirm_reviewed); tidak ada perubahan yang disimpan.' } },
        })
        .where(eq(importBatches.id, batchId));
      await finishJob(jobId, batchId, 'FAILED', 'REVIEW_CONFIRMATION_REQUIRED');
    } else if (e instanceof PublishAbort) {
      await db
        .update(importBatches)
        .set({ status: 'FAILED', summary: { ...prev, last_error: { code: 'VALIDATION_CHANGED', message: `Validasi ulang menemukan galat baru (${String(e.detail)}).` } } })
        .where(eq(importBatches.id, batchId));
      await finishJob(jobId, batchId, 'FAILED', 'VALIDATION_CHANGED');
    } else {
      logger.error({ err: safeErr(e), batchId }, 'import_publish_failed');
      await db
        .update(importBatches)
        .set({ status: 'FAILED', summary: { ...prev, last_error: { code: 'INTERNAL_ERROR', message: 'Publikasi gagal karena galat teknis; tidak ada perubahan yang disimpan.' } } })
        .where(eq(importBatches.id, batchId));
      await finishJob(jobId, batchId, 'FAILED', 'INTERNAL_ERROR');
    }
  }
  return 'done';
}
