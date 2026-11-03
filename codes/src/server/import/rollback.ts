/**
 * Rollback batch (SPEC-019 I6), satu transaksi. Entitas UPDATE dikembalikan ke snapshot `content_revisions` sebelum batch
 * (versi naik +1); entitas CREATE dihapus bila tidak dirujuk data pengguna. Satu penahan saja menolak seluruh rollback.
 */
import { and, eq, inArray, max, sql } from 'drizzle-orm';
import { assessmentSets, contentAssets, contentRevisions, contentSources, importBatches, learningMaterials, modules, subModules } from '@/db/schema';
import { writeAudit } from '../audit';
import { getDb, type Tx } from '../db';
import { ApiError, notFound, type ErrorDetail } from '../http/errors';
import { dbSubSnapshot, loadDbState } from '../content/plan';
import { ensureRevision } from '../content/apply';
import { batchDto, lockImports, summaryOf, type BatchSummary } from './service';

type Applied = NonNullable<BatchSummary['applied_entities']>[number];

async function revisionVersions(tx: Tx, batchId: string, a: Applied) {
  const [r] = await tx
    .select({ v: max(contentRevisions.version) })
    .from(contentRevisions)
    .where(and(eq(contentRevisions.importBatchId, batchId), eq(contentRevisions.entityType, a.kind), eq(contentRevisions.entityId, a.id)));
  const after = r?.v ?? null;
  return { after, before: after === null ? null : after - 1 };
}

async function snapshotOf(tx: Tx, a: Applied, version: number): Promise<Record<string, unknown> | null> {
  const [r] = await tx
    .select({ s: contentRevisions.snapshot })
    .from(contentRevisions)
    .where(and(eq(contentRevisions.entityType, a.kind), eq(contentRevisions.entityId, a.id), eq(contentRevisions.version, version)));
  return (r?.s as Record<string, unknown> | undefined) ?? null;
}

const countSql = async (tx: Tx, q: ReturnType<typeof sql>): Promise<number> => Number(((await tx.execute(q)).rows[0] as { n: number }).n);

/** Alasan entitas CREATE tidak boleh dihapus (data pengguna). */
async function userDataReason(tx: Tx, a: Applied): Promise<string | null> {
  if (a.kind === 'ASSESSMENT_SET') {
    return (await countSql(tx, sql`SELECT count(*)::int AS n FROM attempts WHERE assessment_set_id = ${a.id}::uuid`)) > 0 ? 'Set sudah dikerjakan pengguna (ada percobaan).' : null;
  }
  if (a.kind === 'SUB_MODULE') {
    const att = await countSql(tx, sql`SELECT count(*)::int AS n FROM attempts t JOIN assessment_sets s ON s.id = t.assessment_set_id WHERE s.sub_module_id = ${a.id}::uuid`);
    if (att > 0) return 'Sub-modul sudah dikerjakan pengguna (ada percobaan).';
    const sub = await countSql(tx, sql`SELECT count(*)::int AS n FROM submissions WHERE sub_module_id = ${a.id}::uuid`);
    if (sub > 0) return 'Sub-modul memiliki pengiriman tugas pengguna.';
    const prog = await countSql(tx, sql`SELECT count(*)::int AS n FROM user_sub_module_progress WHERE sub_module_id = ${a.id}::uuid AND (status NOT IN ('LOCKED','UNLOCKED') OR attempts_count > 0)`);
    if (prog > 0) return 'Sub-modul sudah memiliki progres pengguna.';
    const last = await countSql(tx, sql`SELECT count(*)::int AS n FROM user_last_learned_state WHERE active_sub_module_id = ${a.id}::uuid`);
    return last > 0 ? 'Sub-modul tercatat sebagai terakhir dipelajari pengguna.' : null;
  }
  const prog = await countSql(tx, sql`SELECT count(*)::int AS n FROM user_module_progress WHERE module_id = ${a.id}::uuid AND status NOT IN ('LOCKED','UNLOCKED')`);
  return prog > 0 ? 'Modul sudah memiliki progres pengguna.' : null;
}

async function restoreSubModule(tx: Tx, a: Applied, snap: Record<string, unknown>, batchId: string, adminId: string) {
  const [cur] = await tx.select().from(subModules).where(eq(subModules.id, a.id));
  if (!cur) return;
  const next = cur.contentVersion + 1;
  await tx
    .update(subModules)
    .set({
      title: snap.title as string,
      passingScorePercent: snap.passing_score_percent as number,
      orderIndex: snap.order_index as number,
      contentVersion: next,
      updatedAt: new Date(),
    })
    .where(eq(subModules.id, a.id));
  const mats = snap.materials as Record<string, unknown> | undefined;
  if (!mats) {
    await tx.delete(learningMaterials).where(eq(learningMaterials.subModuleId, a.id));
  } else {
    const assets = await tx.select({ id: contentAssets.id, code: contentAssets.assetCode, ref: contentAssets.externalRef, kind: contentAssets.kind }).from(contentAssets);
    const idByCode = new Map(assets.filter((x) => x.code).map((x) => [x.code as string, x.id]));
    const idByVideo = new Map(assets.filter((x) => x.kind === 'VIDEO_EMBED' && x.ref).map((x) => [x.ref as string, x.id]));
    const srcs = new Map((await tx.select({ id: contentSources.id, code: contentSources.code }).from(contentSources)).map((s) => [s.code, s.id]));
    const need = (m: Map<string, string>, k: unknown) => {
      const id = m.get(String(k));
      if (!id) throw new ApiError('ROLLBACK_BLOCKED', { status: 409, message: 'Aset yang dirujuk snapshot tidak lagi ada.', details: [{ path: a.code, code: 'asset_missing', message: String(k) }] });
      return id;
    };
    const vals = {
      articleMarkdown: mats.article_markdown as string,
      videosJson: ((mats.videos as Array<Record<string, unknown>>) ?? []).map((v) => ({ ...v, asset_id: need(idByVideo, v.video_id) })),
      slidesJson: ((mats.slides as Array<Record<string, unknown>>) ?? []).map((s) => ({ asset_id: need(idByCode, s.asset_code), order: s.order, caption: s.caption, alt: s.alt })),
      attachmentsJson: ((mats.attachments as Array<Record<string, unknown>>) ?? []).map((x) => ({ asset_id: need(idByCode, x.asset_code), title: x.title, file_type: x.file_type })),
      miniTaskJson: (mats.mini_task as object | null) ?? {},
      origin: mats.origin as 'ORIGINAL_AUTHORED' | 'AI_GENERATED_REVIEWED' | 'OPEN_LICENSED_ADAPTED',
      sourceId: mats.source_code ? (srcs.get(mats.source_code as string) ?? null) : null,
      attributionText: (mats.attribution_text as string | null) ?? null,
    };
    await tx
      .insert(learningMaterials)
      .values({ subModuleId: a.id, ...vals, contentVersion: next })
      .onConflictDoUpdate({ target: learningMaterials.subModuleId, set: { ...vals, contentVersion: next, updatedAt: new Date() } });
  }
  const st = await loadDbState(tx);
  const [fresh] = await tx.select().from(subModules).where(eq(subModules.id, a.id));
  await ensureRevision(tx, 'SUB_MODULE', a.id, next, dbSubSnapshot(st, fresh!, true), { actorUserId: adminId, importBatchId: batchId });
}

async function restoreSet(tx: Tx, a: Applied, snap: Record<string, unknown>, batchId: string, adminId: string) {
  const [row] = await tx
    .update(assessmentSets)
    .set({
      title: snap.title as string,
      timeLimitSeconds: snap.timeLimitSeconds as number,
      readingPassageMarkdown: (snap.readingPassageMarkdown as string | null) ?? null,
      listeningAssetId: (snap.listeningAssetId as string | null) ?? null,
      questionsJson: snap.questionsJson as object[],
      questionCount: snap.questionCount as number,
      passPercent: (snap.passPercent as number | null) ?? null,
      origin: snap.origin as 'ORIGINAL_AUTHORED' | 'AI_GENERATED_REVIEWED' | 'OPEN_LICENSED_ADAPTED',
      sourceId: (snap.sourceId as string | null) ?? null,
      attributionText: (snap.attributionText as string | null) ?? null,
      contentHash: (snap.contentHash as string | null) ?? null,
      version: sql`${assessmentSets.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(assessmentSets.id, a.id))
    .returning();
  if (row) await ensureRevision(tx, 'ASSESSMENT_SET', a.id, row.version, row, { actorUserId: adminId, importBatchId: batchId });
}

export async function rollbackBatch(actorId: string, batchId: string, ipHash: string | null) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await lockImports(tx);
    const [b] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).for('update');
    if (!b) throw notFound();
    if (b.status !== 'PUBLISHED') throw new ApiError('BATCH_NOT_ROLLBACKABLE', { status: 409, message: 'Hanya batch PUBLISHED yang dapat dikembalikan.' });
    const s = summaryOf(b);
    const applied = s.applied_entities ?? [];
    const created = applied.filter((a) => a.action === 'CREATE');
    const updated = applied.filter((a) => a.action === 'UPDATE');

    // ---- penahan
    const blockers: ErrorDetail[] = [];
    for (const a of created) {
      const reason = await userDataReason(tx, a);
      if (reason) blockers.push({ path: a.code, code: 'has_user_data', message: reason });
    }
    const createdIds = new Set(created.map((c) => c.id));
    for (const m of created.filter((c) => c.kind === 'MODULE')) {
      const foreign = await countSql(
        tx,
        sql`SELECT count(*)::int AS n FROM sub_modules WHERE module_id = ${m.id}::uuid AND id NOT IN (${sql.join([sql`${NIL}::uuid`, ...created.filter((c) => c.kind === 'SUB_MODULE').map((c) => sql`${c.id}::uuid`)], sql`, `)})`,
      );
      if (foreign > 0) blockers.push({ path: m.code, code: 'has_dependents', message: 'Modul memiliki sub-modul lain yang bukan bagian batch ini.' });
    }
    const plans: Array<{ a: Applied; snap: Record<string, unknown> }> = [];
    for (const a of updated) {
      const v = await revisionVersions(tx, batchId, a);
      const snap = v.before !== null && v.before >= 1 ? await snapshotOf(tx, a, v.before) : null;
      if (!snap) {
        blockers.push({ path: a.code, code: 'snapshot_missing', message: 'Snapshot sebelum batch tidak ditemukan.' });
        continue;
      }
      const curVersion =
        a.kind === 'SUB_MODULE'
          ? (await tx.select({ v: subModules.contentVersion }).from(subModules).where(eq(subModules.id, a.id)))[0]?.v
          : a.kind === 'ASSESSMENT_SET'
            ? (await tx.select({ v: assessmentSets.version }).from(assessmentSets).where(eq(assessmentSets.id, a.id)))[0]?.v
            : v.after;
      if (curVersion !== v.after) blockers.push({ path: a.code, code: 'changed_since_batch', message: 'Entitas sudah diubah setelah batch ini.' });
      plans.push({ a, snap });
    }
    if (blockers.length) {
      throw new ApiError('ROLLBACK_BLOCKED', { status: 409, message: 'Rollback ditolak karena data pengguna atau perubahan lanjutan.', details: blockers });
    }

    // ---- pulihkan entitas UPDATE
    for (const { a, snap } of plans) {
      if (a.kind === 'SUB_MODULE') await restoreSubModule(tx, a, snap, batchId, actorId);
      else if (a.kind === 'ASSESSMENT_SET') await restoreSet(tx, a, snap, batchId, actorId);
      else {
        await tx.update(modules).set({ title: snap.title as string, skillCategory: snap.skill as 'GRAMMAR', orderIndex: snap.order as number, updatedAt: new Date() }).where(eq(modules.id, a.id));
      }
    }
    // ---- hapus entitas CREATE: set (section sebelum induk) -> sub-modul -> modul
    const setIds = created.filter((c) => c.kind === 'ASSESSMENT_SET').map((c) => c.id);
    if (setIds.length) {
      await tx.delete(assessmentSets).where(and(inArray(assessmentSets.id, setIds), eq(assessmentSets.assessmentType, 'BOSS_SECTION')));
      await tx.delete(assessmentSets).where(inArray(assessmentSets.id, setIds));
    }
    const subIds = created.filter((c) => c.kind === 'SUB_MODULE').map((c) => c.id);
    if (subIds.length) await tx.delete(subModules).where(inArray(subModules.id, subIds));
    const modIds = created.filter((c) => c.kind === 'MODULE' && createdIds.has(c.id)).map((c) => c.id);
    if (modIds.length) await tx.delete(modules).where(inArray(modules.id, modIds));

    await tx.update(importBatches).set({ status: 'ROLLED_BACK' }).where(eq(importBatches.id, batchId));
    await writeAudit(tx, {
      actorUserId: actorId,
      action: 'IMPORT_ROLLED_BACK',
      entityType: 'import_batch',
      entityId: batchId,
      metadata: { batch_id: batchId, restored: updated.length, deleted: created.length },
      ipHash,
    });
  });
  const [fresh] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  return batchDto(db, fresh!);
}

const NIL = '00000000-0000-4000-8000-000000000000';
