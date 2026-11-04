/**
 * CurationService (SPEC-020): alur status (K1/K2), penyuntingan terbatas modul/sub-modul/materi/set/soal, versi + revisi (K4),
 * pagar set berjalan (K3), statistik kualitas soal (K5). Semua mutasi: satu transaksi, baris entitas dikunci `FOR UPDATE`
 * (penyuntingan serentak menjadi berurutan sehingga `content_revisions` tidak pernah bentrok), audit tanpa isi konten.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { assessmentSets, contentAssets, contentRevisions, learningMaterials, modules, subModules, tiers, users } from '@/db/schema';
import type { ContentIssue } from '@/contracts/content';
import type { z } from 'zod';
import type {
  CurationEntityName,
  UpdateAssessmentSetRequestSchema,
  UpdateMaterialRequestSchema,
  UpdateModuleRequestSchema,
  UpdateQuestionRequestSchema,
  UpdateSubModuleRequestSchema,
} from '@/contracts/curation';
import { writeAudit } from '../audit';
import { nowDate } from '../clock';
import { checkMarkdown, canonicalJson, checkPassageText, sha256Hex } from '../content/validate';
import { computeBlockers, type Blocker, type PublishEntityType } from '../content/publish';
import { dbSubSnapshot, type DbState } from '../content/plan';
import type { Db, Tx } from '../db';
import { ApiError, notFound, type ErrorDetail } from '../http/errors';
import { activeAttemptSetIds, hasActiveAttempts } from '../content/active-attempts';
import { canTransition, correctRate, escapeLike, mergeQuestionEdit, passageOutOfRange, qualityFlag, type Status } from './rules';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
export interface Actor {
  id: string;
  ipHash?: string;
}

const iso = (d: Date | string | null): string | null => (d === null ? null : new Date(d).toISOString());
const toDetails = (issues: ContentIssue[]): ErrorDetail[] =>
  issues.map((i) => ({ path: i.path, code: i.code === 'unsafe_link_scheme' ? 'unsafe_link' : i.code, message: i.message }));
const validationFailed = (issues: ContentIssue[]) => new ApiError('VALIDATION_ERROR', { details: toDetails(issues) });

function isUnique(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } } | null;
  const code = e?.code ?? e?.cause?.code;
  if (code !== '23505') return false;
  return constraint ? (e?.constraint ?? e?.cause?.constraint) === constraint : true;
}

/** Jalankan mutasi dalam transaksi; bentrok versi revisi dicoba ulang sekali, selain itu 409 CONFLICT_RETRY. */
async function mutate<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(fn);
    } catch (err) {
      if (!isUnique(err, 'content_rev_entity_version_uq')) throw err;
      if (attempt >= 1) throw new ApiError('CONFLICT_RETRY');
    }
  }
}

async function revision(tx: Tx, type: 'SUB_MODULE' | 'LEARNING_MATERIAL' | 'ASSESSMENT_SET' | 'MODULE', id: string, version: number, snapshot: unknown, actor: Actor) {
  await tx
    .insert(contentRevisions)
    .values({ entityType: type, entityId: id, version, snapshot: snapshot as object, changedBy: actor.id })
    .onConflictDoNothing();
}

async function audit(tx: Tx, actor: Actor, action: 'CONTENT_EDITED' | 'CONTENT_STATUS_CHANGED', entityId: string, metadata: Record<string, unknown>) {
  await writeAudit(tx, { actorUserId: actor.id, action, entityType: String(metadata.entity ?? ''), entityId, metadata, ipHash: actor.ipHash });
}

// ------------------------------------------------------------------ K3: set berjalan
// Definisi "hidup" bersama kurasi dan impor SPEC-019 ada di `content/active-attempts.ts` (F-20-04).

/** K3 untuk modul/sub-modul (F-20-01): set Drill/Skip di bawahnya tidak boleh sedang dikerjakan saat diturunkan/diarsipkan. */
async function entityHasActiveAttempts(tx: Tx, entity: CurationEntityName, id: string): Promise<boolean> {
  if (entity === 'assessment-sets') return hasActiveAttempts(tx, id);
  const rows = await tx.execute(
    entity === 'sub-modules'
      ? sql`SELECT id::text AS id FROM assessment_sets WHERE sub_module_id = ${id}::uuid`
      : sql`SELECT id::text AS id FROM assessment_sets
            WHERE module_id = ${id}::uuid OR sub_module_id IN (SELECT sm.id FROM sub_modules sm WHERE sm.module_id = ${id}::uuid)`,
  );
  const ids = (rows.rows as Array<{ id: string }>).map((r) => r.id);
  return (await activeAttemptSetIds(tx, ids)).size > 0;
}

async function lockSet(tx: Tx, setId: string) {
  const [set] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, setId)).limit(1).for('update');
  if (!set) throw notFound();
  return set;
}
const activeAttemptsError = () =>
  new ApiError('SET_HAS_ACTIVE_ATTEMPTS', { details: [{ path: 'set_id', code: 'attempts_in_progress', message: 'Ada pengguna yang sedang mengerjakan konten ini (percobaan masih berjalan).' }] });

// ------------------------------------------------------------------ pemilihan set per lingkup
const RANK: Record<string, number> = { PUBLISHED: 0, APPROVED: 1, IN_REVIEW: 2, DRAFT: 3, ARCHIVED: 4 };
function pick<T extends { status: string; updatedAt: Date; id: string }>(rows: T[]): T | null {
  return [...rows].sort((a, b) => (RANK[a.status]! - RANK[b.status]!) || b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? -1 : 1))[0] ?? null;
}
const setRef = (s: typeof assessmentSets.$inferSelect | null, extra: Record<string, unknown> = {}) =>
  s ? { id: s.id, status: s.status, question_count: s.questionCount, version: s.version, origin: s.origin, ...extra } : null;

// ------------------------------------------------------------------ GET /admin/curriculum
export async function getCurriculum(db: Db) {
  const [tierRows, modRows, subRows, setRows, matRows, viewRows] = await Promise.all([
    db.select().from(tiers).orderBy(asc(tiers.tierNumber)),
    db.select().from(modules).orderBy(asc(modules.orderIndex)),
    db.select().from(subModules).orderBy(asc(subModules.orderIndex)),
    db.select().from(assessmentSets),
    db.select({ id: learningMaterials.id, subModuleId: learningMaterials.subModuleId, origin: learningMaterials.origin }).from(learningMaterials),
    db.execute(sql`SELECT entity_id::text AS entity_id, count(*)::int AS n FROM v_publish_blockers WHERE entity_type = 'LEARNING_MATERIAL' GROUP BY entity_id`),
  ]);
  const viewCount = new Map((viewRows.rows as Row[]).map((r) => [r.entity_id as string, Number(r.n)]));
  const matBySub = new Map(matRows.map((m) => [m.subModuleId, m]));
  const by = (type: string, key: 'tierId' | 'moduleId' | 'subModuleId' | 'parentSetId', id: string) =>
    setRows.filter((s) => s.assessmentType === type && s[key] === id);

  const SKILL_ORDER = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'];
  const tiersOut = tierRows.map((t) => {
    const boss = pick(by('TIER_BOSS_EXAM', 'tierId', t.id));
    const kids = boss ? setRows.filter((s) => s.assessmentType === 'BOSS_SECTION' && s.parentSetId === boss.id && s.status !== 'ARCHIVED') : [];
    const skills = SKILL_ORDER.filter((k) => kids.some((s) => s.skillCategory === k));
    return {
      tier_number: Number(t.tierNumber),
      title: t.title,
      skip_set: setRef(pick(by('SKIP_TIER_TEST', 'tierId', t.id))),
      boss: setRef(boss, { section_skills: skills }),
      modules: modRows
        .filter((m) => m.tierId === t.id)
        .map((m) => ({
          id: m.id,
          module_code: m.moduleCode,
          title: m.title,
          order_index: m.orderIndex,
          status: m.status,
          skip_set: setRef(pick(by('SKIP_MODULE_TEST', 'moduleId', m.id))),
          sub_modules: subRows
            .filter((s) => s.moduleId === m.id)
            .map((s) => {
              const mat = matBySub.get(s.id);
              const drills = by('ACTIVE_DRILL', 'subModuleId', s.id);
              const blockerCount = (mat ? (viewCount.get(mat.id) ?? 0) : 1) + (drills.some((d) => d.status === 'PUBLISHED') ? 0 : 1);
              return {
                id: s.id,
                sub_module_code: s.subModuleCode,
                title: s.title,
                order_index: s.orderIndex,
                status: s.status,
                passing_score_percent: s.passingScorePercent,
                content_version: s.contentVersion,
                origin: mat?.origin ?? null,
                has_material: Boolean(mat),
                drill: setRef(pick(drills)),
                blocker_count: blockerCount,
              };
            }),
        })),
    };
  });
  const placement = pick(setRows.filter((s) => s.assessmentType === 'PLACEMENT_TEST'));
  return { tiers: tiersOut, placement: setRef(placement) };
}

// ------------------------------------------------------------------ GET /admin/sub-modules/{id}
export async function getSubModuleDetail(db: Db, subModuleId: string) {
  return db.transaction(async (tx) => {
    const [sub] = await tx.select().from(subModules).where(eq(subModules.id, subModuleId)).limit(1);
    if (!sub) throw notFound();
    const [mod] = await tx.select().from(modules).where(eq(modules.id, sub.moduleId)).limit(1);
    const [lm] = await tx.select().from(learningMaterials).where(eq(learningMaterials.subModuleId, sub.id)).limit(1);
    const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
    const assetIds = lm ? [lm.videosJson, lm.slidesJson, lm.attachmentsJson].flatMap((j) => arr(j).map((x) => String(x.asset_id))) : [];
    const assets = assetIds.length ? await tx.select({ id: contentAssets.id, rights: contentAssets.rightsStatus, ref: contentAssets.externalRef }).from(contentAssets).where(sql`${contentAssets.id}::text IN (${sql.join(assetIds.map((i) => sql`${i}`), sql`, `)})`) : [];
    const byId = new Map(assets.map((a) => [a.id, a]));
    const mt = (lm?.miniTaskJson ?? {}) as Row;
    const drill = pick(await tx.select().from(assessmentSets).where(and(eq(assessmentSets.subModuleId, sub.id), eq(assessmentSets.assessmentType, 'ACTIVE_DRILL'))));
    return {
      sub_module: {
        id: sub.id,
        sub_module_code: sub.subModuleCode,
        title: sub.title,
        order_index: sub.orderIndex,
        status: sub.status,
        passing_score_percent: sub.passingScorePercent,
        content_version: sub.contentVersion,
        module: { id: mod!.id, module_code: mod!.moduleCode, title: mod!.title },
      },
      material: lm
        ? {
            article_markdown: lm.articleMarkdown,
            origin: lm.origin,
            attribution_text: lm.attributionText,
            content_version: lm.contentVersion,
            videos: arr(lm.videosJson).map((v) => ({
              asset_id: v.asset_id,
              video_id: v.video_id ?? byId.get(v.asset_id)?.ref ?? '',
              title: v.title ?? '',
              start_sec: v.start_sec ?? 0,
              end_sec: v.end_sec ?? 0,
              rights_status: byId.get(v.asset_id)?.rights ?? 'UNVERIFIED',
            })),
            slides: arr(lm.slidesJson).map((x) => ({ asset_id: x.asset_id, order: x.order ?? 1, caption: x.caption ?? '', rights_status: byId.get(x.asset_id)?.rights ?? 'UNVERIFIED' })),
            attachments: arr(lm.attachmentsJson).map((a) => ({ asset_id: a.asset_id, title: a.title ?? '', file_type: a.file_type ?? '', rights_status: byId.get(a.asset_id)?.rights ?? 'UNVERIFIED' })),
            mini_task: mt.task_type ? { task_type: mt.task_type, prompt: mt.prompt ?? '', ai_rubric_criteria: mt.ai_rubric_criteria ?? '' } : null,
          }
        : null,
      drill: drill ? { id: drill.id, status: drill.status, question_count: drill.questionCount, version: drill.version } : null,
      blockers: await computeBlockers(tx, 'SUB_MODULE', sub.id),
    };
  });
}

// ------------------------------------------------------------------ PATCH modul
export async function updateModule(db: Db, actor: Actor, moduleId: string, body: z.infer<typeof UpdateModuleRequestSchema>) {
  return mutate(db, async (tx) => {
    const [m] = await tx.select().from(modules).where(eq(modules.id, moduleId)).limit(1).for('update');
    if (!m) throw notFound();
    const next = { title: body.title ?? m.title, orderIndex: body.order_index ?? m.orderIndex };
    const fields = [...(body.title !== undefined && body.title !== m.title ? ['title'] : []), ...(body.order_index !== undefined && body.order_index !== m.orderIndex ? ['order_index'] : [])];
    if (fields.length > 0) {
      if (next.orderIndex !== m.orderIndex) {
        const [clash] = await tx.select({ id: modules.id }).from(modules).where(and(eq(modules.tierId, m.tierId), eq(modules.orderIndex, next.orderIndex))).limit(1);
        if (clash) throw new ApiError('ORDER_INDEX_TAKEN');
      }
      const [{ v }] = (await tx.select({ v: sql<number>`coalesce(max(${contentRevisions.version}), 0)::int` }).from(contentRevisions).where(sql`${contentRevisions.entityType} = 'MODULE' AND ${contentRevisions.entityId} = ${m.id}::uuid`)) as [{ v: number }];
      await revision(tx, 'MODULE', m.id, Number(v) + 1, { title: m.title, skill: m.skillCategory, order: m.orderIndex }, actor);
      try {
        await tx.update(modules).set({ title: next.title, orderIndex: next.orderIndex, updatedAt: nowDate() }).where(eq(modules.id, m.id));
      } catch (err) {
        if (isUnique(err)) throw new ApiError('ORDER_INDEX_TAKEN');
        throw err;
      }
      await audit(tx, actor, 'CONTENT_EDITED', m.id, { entity: 'module', id: m.id, fields });
    }
    return { id: m.id, module_code: m.moduleCode, title: next.title, order_index: next.orderIndex, status: m.status };
  });
}

// ------------------------------------------------------------------ snapshot sub-modul (bentuk sama dengan impor)
async function subSnapshot(tx: Tx, sub: typeof subModules.$inferSelect, lm: typeof learningMaterials.$inferSelect | undefined) {
  const ids = lm ? [lm.videosJson, lm.slidesJson, lm.attachmentsJson].flatMap((j) => (Array.isArray(j) ? (j as Row[]).map((x) => String(x.asset_id)) : [])) : [];
  const assets = ids.length ? await tx.select({ id: contentAssets.id, code: contentAssets.assetCode, ref: contentAssets.externalRef }).from(contentAssets).where(sql`${contentAssets.id}::text IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`) : [];
  const state = {
    materials: new Map(lm ? [[sub.id, lm]] : []),
    assetCodeById: new Map(assets.map((a) => [a.id, a.code])),
    assetVideoById: new Map(assets.map((a) => [a.id, a.ref])),
    sourceCodeById: new Map<string, string>(),
  } as unknown as DbState;
  return dbSubSnapshot(state, sub, true);
}

// ------------------------------------------------------------------ PATCH sub-modul
export async function updateSubModule(db: Db, actor: Actor, subModuleId: string, body: z.infer<typeof UpdateSubModuleRequestSchema>) {
  return mutate(db, async (tx) => {
    const [s] = await tx.select().from(subModules).where(eq(subModules.id, subModuleId)).limit(1).for('update');
    if (!s) throw notFound();
    const contentChanged = (body.title !== undefined && body.title !== s.title) || (body.passing_score_percent !== undefined && body.passing_score_percent !== s.passingScorePercent);
    const orderChanged = body.order_index !== undefined && body.order_index !== s.orderIndex;
    const fields = [
      ...(body.title !== undefined && body.title !== s.title ? ['title'] : []),
      ...(orderChanged ? ['order_index'] : []),
      ...(body.passing_score_percent !== undefined && body.passing_score_percent !== s.passingScorePercent ? ['passing_score_percent'] : []),
    ];
    let version = s.contentVersion;
    if (fields.length > 0) {
      if (orderChanged) {
        const [clash] = await tx.select({ id: subModules.id }).from(subModules).where(and(eq(subModules.moduleId, s.moduleId), eq(subModules.orderIndex, body.order_index!))).limit(1);
        if (clash) throw new ApiError('ORDER_INDEX_TAKEN');
      }
      if (contentChanged) {
        const [lm] = await tx.select().from(learningMaterials).where(eq(learningMaterials.subModuleId, s.id)).limit(1);
        await revision(tx, 'SUB_MODULE', s.id, s.contentVersion, await subSnapshot(tx, s, lm), actor);
        version = s.contentVersion + 1;
      }
      try {
        await tx
          .update(subModules)
          .set({ title: body.title ?? s.title, orderIndex: body.order_index ?? s.orderIndex, passingScorePercent: body.passing_score_percent ?? s.passingScorePercent, contentVersion: version, updatedAt: nowDate() })
          .where(eq(subModules.id, s.id));
      } catch (err) {
        if (isUnique(err)) throw new ApiError('ORDER_INDEX_TAKEN');
        throw err;
      }
      await audit(tx, actor, 'CONTENT_EDITED', s.id, { entity: 'sub_module', id: s.id, fields });
    }
    return {
      id: s.id,
      sub_module_code: s.subModuleCode,
      title: body.title ?? s.title,
      order_index: body.order_index ?? s.orderIndex,
      passing_score_percent: body.passing_score_percent ?? s.passingScorePercent,
      status: s.status,
      content_version: version,
    };
  });
}

// ------------------------------------------------------------------ PATCH materi
export async function updateMaterial(db: Db, actor: Actor, subModuleId: string, body: z.infer<typeof UpdateMaterialRequestSchema>) {
  return mutate(db, async (tx) => {
    const [s] = await tx.select().from(subModules).where(eq(subModules.id, subModuleId)).limit(1).for('update');
    if (!s) throw notFound();
    const [lm] = await tx.select().from(learningMaterials).where(eq(learningMaterials.subModuleId, s.id)).limit(1).for('update');
    if (!lm) throw notFound();

    const issues: ContentIssue[] = [];
    if (body.article_markdown !== undefined) checkMarkdown(body.article_markdown, 'article_markdown', issues);
    if (body.mini_task) {
      checkMarkdown(body.mini_task.prompt, 'mini_task.prompt', issues);
    }
    if (issues.length > 0) throw validationFailed(issues);

    const nextMini = body.mini_task === undefined ? undefined : body.mini_task === null ? {} : { task_type: body.mini_task.task_type, prompt: body.mini_task.prompt, ai_rubric_criteria: body.mini_task.ai_rubric_criteria };
    const fields = [
      ...(body.article_markdown !== undefined && body.article_markdown !== lm.articleMarkdown ? ['article_markdown'] : []),
      ...(body.attribution_text !== undefined && (body.attribution_text ?? null) !== lm.attributionText ? ['attribution_text'] : []),
      ...(nextMini !== undefined && canonicalJson(nextMini) !== canonicalJson(lm.miniTaskJson ?? {}) ? ['mini_task'] : []),
    ];
    if (fields.length === 0) return { content_version: lm.contentVersion, updated_at: lm.updatedAt.toISOString() };

    await revision(tx, 'SUB_MODULE', s.id, s.contentVersion, await subSnapshot(tx, s, lm), actor);
    await revision(tx, 'LEARNING_MATERIAL', lm.id, lm.contentVersion, lm, actor);
    const now = nowDate();
    const [updated] = await tx
      .update(learningMaterials)
      .set({
        ...(body.article_markdown !== undefined ? { articleMarkdown: body.article_markdown } : {}),
        ...(body.attribution_text !== undefined ? { attributionText: body.attribution_text } : {}),
        ...(nextMini !== undefined ? { miniTaskJson: nextMini } : {}),
        contentVersion: lm.contentVersion + 1,
        updatedAt: now,
      })
      .where(eq(learningMaterials.id, lm.id))
      .returning();
    await tx.update(subModules).set({ contentVersion: s.contentVersion + 1, updatedAt: now }).where(eq(subModules.id, s.id));
    await audit(tx, actor, 'CONTENT_EDITED', lm.id, { entity: 'learning_material', id: lm.id, sub_module_id: s.id, fields });
    return { content_version: updated!.contentVersion, updated_at: updated!.updatedAt.toISOString() };
  });
}

// ------------------------------------------------------------------ daftar dan detail set
const SET_FROM = sql`
  FROM assessment_sets s
  LEFT JOIN tiers t ON t.id = s.tier_id
  LEFT JOIN sub_modules sm ON sm.id = s.sub_module_id
  LEFT JOIN modules smm ON smm.id = sm.module_id
  LEFT JOIN tiers smt ON smt.id = smm.tier_id
  LEFT JOIN modules m ON m.id = s.module_id
  LEFT JOIN tiers mt ON mt.id = m.tier_id
  LEFT JOIN assessment_sets p ON p.id = s.parent_set_id
  LEFT JOIN tiers pt ON pt.id = p.tier_id`;
const TIER_EXPR = sql`COALESCE(t.tier_number, smt.tier_number, mt.tier_number, pt.tier_number)`;
const SUMMARY_COLS = sql`
  s.id, s.assessment_type, s.title, s.status, s.question_count, s.version, s.origin, s.updated_at,
  CASE s.assessment_type
    WHEN 'ACTIVE_DRILL' THEN 'Sub-modul ' || sm.sub_module_code
    WHEN 'SKIP_MODULE_TEST' THEN 'Modul ' || m.module_code
    WHEN 'SKIP_TIER_TEST' THEN 'Tier ' || t.tier_number
    WHEN 'TIER_BOSS_EXAM' THEN 'Tier ' || t.tier_number
    WHEN 'BOSS_SECTION' THEN 'Tier ' || pt.tier_number || ' - ' || COALESCE(s.skill_category::text, '')
    ELSE 'Placement Test' END AS scope_label`;
const summaryOf = (r: Row) => ({
  id: r.id as string,
  assessment_type: r.assessment_type as string,
  title: r.title as string,
  status: r.status as string,
  question_count: Number(r.question_count),
  version: Number(r.version),
  origin: r.origin as string,
  scope_label: r.scope_label as string,
  updated_at: new Date(r.updated_at).toISOString(),
});

export async function listSets(db: Db, q: { assessment_type?: string; status?: string; tier_number?: number; q?: string; page: number; page_size: number }) {
  const conds = [sql`TRUE`];
  if (q.assessment_type) conds.push(sql`s.assessment_type = ${q.assessment_type}::assessment_type`);
  if (q.status) conds.push(sql`s.status = ${q.status}::review_status`);
  if (q.tier_number !== undefined) conds.push(sql`${TIER_EXPR} = ${q.tier_number}`);
  if (q.q) conds.push(sql`s.title ILIKE ${`%${escapeLike(q.q)}%`} ESCAPE '\\'`);
  const where = sql.join(conds, sql` AND `);
  const total = await db.execute(sql`SELECT count(*)::int AS n ${SET_FROM} WHERE ${where}`);
  const rows = await db.execute(sql`SELECT ${SUMMARY_COLS} ${SET_FROM} WHERE ${where} ORDER BY s.updated_at DESC, s.id ASC LIMIT ${q.page_size} OFFSET ${(q.page - 1) * q.page_size}`);
  return { data: (rows.rows as Row[]).map(summaryOf), meta: { page: q.page, page_size: q.page_size, total: Number((total.rows[0] as Row).n) } };
}

export async function getSetDetail(db: Db, setId: string) {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`SELECT ${SUMMARY_COLS} ${SET_FROM} WHERE s.id = ${setId}::uuid`);
    const row = r.rows[0] as Row | undefined;
    if (!row) throw notFound();
    const [set] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, setId)).limit(1);
    return {
      ...summaryOf(row),
      time_limit_seconds: set!.timeLimitSeconds,
      pass_percent: set!.passPercent,
      reading_passage_markdown: set!.readingPassageMarkdown,
      listening_asset_id: set!.listeningAssetId,
      attribution_text: set!.attributionText,
      reviewed_at: iso(set!.reviewedAt),
      has_active_attempts: await hasActiveAttempts(tx, setId),
      questions: Array.isArray(set!.questionsJson) ? set!.questionsJson : [],
      blockers: await computeBlockers(tx, 'ASSESSMENT_SET', setId),
    };
  });
}

// ------------------------------------------------------------------ PATCH set
const setHash = (s: { title: string; timeLimitSeconds: number; passPercent: number | null; readingPassageMarkdown: string | null; listeningAssetId: string | null; questionsJson: unknown }) =>
  sha256Hex(
    canonicalJson({
      title: s.title,
      time_limit_seconds: s.timeLimitSeconds,
      pass_percent: s.passPercent,
      reading_passage_markdown: s.readingPassageMarkdown,
      listening_asset_id: s.listeningAssetId,
      questions: s.questionsJson,
    }),
  );

export async function updateSet(db: Db, actor: Actor, setId: string, body: z.infer<typeof UpdateAssessmentSetRequestSchema>) {
  return mutate(db, async (tx) => {
    const set = await lockSet(tx, setId);
    if (await hasActiveAttempts(tx, set.id)) throw activeAttemptsError();

    const next = {
      title: body.title ?? set.title,
      timeLimitSeconds: body.time_limit_seconds ?? set.timeLimitSeconds,
      passPercent: body.pass_percent === undefined ? set.passPercent : body.pass_percent,
      readingPassageMarkdown: body.reading_passage_markdown === undefined ? set.readingPassageMarkdown : body.reading_passage_markdown,
    };
    const fields = [
      ...(next.title !== set.title ? ['title'] : []),
      ...(next.timeLimitSeconds !== set.timeLimitSeconds ? ['time_limit_seconds'] : []),
      ...(next.passPercent !== set.passPercent ? ['pass_percent'] : []),
      ...(next.readingPassageMarkdown !== set.readingPassageMarkdown ? ['reading_passage_markdown'] : []),
    ];

    if (body.reading_passage_markdown !== undefined && body.reading_passage_markdown !== null) {
      const issues: ContentIssue[] = [];
      checkPassageText(body.reading_passage_markdown, 'reading_passage_markdown', issues);
      if (issues.some((i) => i.severity === 'error')) throw validationFailed(issues.filter((i) => i.severity === 'error'));
    }
    if (fields.includes('reading_passage_markdown')) {
      const orphan = passageOutOfRange((Array.isArray(set.questionsJson) ? set.questionsJson : []) as Row[], next.readingPassageMarkdown);
      if (orphan.length > 0) {
        throw new ApiError('VALIDATION_ERROR', {
          details: orphan.map((id) => ({ path: `questions.${id}.passage_no`, code: 'passage_out_of_range', message: 'Soal ini merujuk bagian teks yang tidak ada lagi.' })),
        });
      }
    }
    if (fields.length === 0) return { id: set.id, title: set.title, time_limit_seconds: set.timeLimitSeconds, pass_percent: set.passPercent, version: set.version, content_hash: set.contentHash ?? '' };

    await revision(tx, 'ASSESSMENT_SET', set.id, set.version, set, actor);
    const hash = setHash({ ...next, listeningAssetId: set.listeningAssetId, questionsJson: set.questionsJson });
    const [row] = await tx
      .update(assessmentSets)
      .set({ title: next.title, timeLimitSeconds: next.timeLimitSeconds, passPercent: next.passPercent, readingPassageMarkdown: next.readingPassageMarkdown, version: set.version + 1, contentHash: hash, updatedAt: nowDate() })
      .where(eq(assessmentSets.id, set.id))
      .returning();
    await audit(tx, actor, 'CONTENT_EDITED', set.id, { entity: 'assessment_set', id: set.id, fields });
    return { id: row!.id, title: row!.title, time_limit_seconds: row!.timeLimitSeconds, pass_percent: row!.passPercent, version: row!.version, content_hash: row!.contentHash ?? '' };
  });
}

// ------------------------------------------------------------------ PATCH soal
export async function updateQuestion(db: Db, actor: Actor, setId: string, questionId: string, body: z.infer<typeof UpdateQuestionRequestSchema>) {
  return mutate(db, async (tx) => {
    const set = await lockSet(tx, setId);
    const list = (Array.isArray(set.questionsJson) ? set.questionsJson : []) as Row[];
    const idx = list.findIndex((q) => q.question_id === questionId);
    if (idx < 0) throw notFound();
    if (await hasActiveAttempts(tx, set.id)) throw activeAttemptsError();

    const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    const res = mergeQuestionEdit(list[idx]!, patch, { placement: set.assessmentType === 'PLACEMENT_TEST', passageMarkdown: set.readingPassageMarkdown });
    if (!res.question) throw validationFailed(res.issues);

    const updated = res.question as unknown as Row;
    const questions = list.map((q, i) => (i === idx ? updated : q));
    if (canonicalJson(updated) === canonicalJson(list[idx])) {
      return { question: updated, set: { id: set.id, version: set.version, content_hash: set.contentHash ?? '' } };
    }
    await revision(tx, 'ASSESSMENT_SET', set.id, set.version, set, actor);
    const hash = setHash({ title: set.title, timeLimitSeconds: set.timeLimitSeconds, passPercent: set.passPercent, readingPassageMarkdown: set.readingPassageMarkdown, listeningAssetId: set.listeningAssetId, questionsJson: questions });
    const [row] = await tx
      .update(assessmentSets)
      .set({ questionsJson: questions as unknown as object[], version: set.version + 1, contentHash: hash, updatedAt: nowDate() })
      .where(eq(assessmentSets.id, set.id))
      .returning();
    await audit(tx, actor, 'CONTENT_EDITED', set.id, { entity: 'assessment_set', id: set.id, question_id: questionId, fields: Object.keys(patch) });
    return { question: updated, set: { id: row!.id, version: row!.version, content_hash: row!.contentHash ?? '' } };
  });
}

// ------------------------------------------------------------------ POST status
const ENTITY_TYPE: Record<CurationEntityName, PublishEntityType> = { modules: 'MODULE', 'sub-modules': 'SUB_MODULE', 'assessment-sets': 'ASSESSMENT_SET' };

export async function changeStatus(db: Db, actor: Actor, entity: CurationEntityName, id: string, body: { status: Status; confirm_reviewed?: boolean }) {
  return mutate(db, async (tx) => {
    const type = ENTITY_TYPE[entity];
    let from: Status;
    let origin: string | null = null;
    if (entity === 'modules') {
      const [m] = await tx.select().from(modules).where(eq(modules.id, id)).limit(1).for('update');
      if (!m) throw notFound();
      from = m.status;
    } else if (entity === 'sub-modules') {
      const [s] = await tx.select().from(subModules).where(eq(subModules.id, id)).limit(1).for('update');
      if (!s) throw notFound();
      from = s.status;
      const [lm] = await tx.select({ origin: learningMaterials.origin }).from(learningMaterials).where(eq(learningMaterials.subModuleId, id)).limit(1);
      origin = lm?.origin ?? null;
    } else {
      const set = await lockSet(tx, id);
      from = set.status;
      origin = set.origin;
    }
    const to = body.status;
    if (!canTransition(from, to)) {
      throw new ApiError('INVALID_STATUS_TRANSITION', { details: [{ path: 'status', code: 'transition_not_allowed', message: `Perubahan ${from} ke ${to} tidak diizinkan.` }] });
    }

    const confirmed = to === 'PUBLISHED' && origin === 'AI_GENERATED_REVIEWED';
    if (confirmed && body.confirm_reviewed !== true) {
      throw new ApiError('REVIEW_CONFIRMATION_REQUIRED', { details: [{ path: 'confirm_reviewed', code: 'required', message: 'confirm_reviewed wajib true untuk konten buatan AI.' }] });
    }
    if (to === 'PUBLISHED') {
      const blockers: Blocker[] = await computeBlockers(tx, type, id);
      if (blockers.length > 0) {
        throw new ApiError('PUBLISH_BLOCKED', { details: blockers.map((b) => ({ path: `${b.entity_type}:${b.entity_id}`, code: b.code, message: b.detail })) });
      }
    }
    // K3 (F-20-01): set -> hanya dari PUBLISHED; modul/sub-modul -> setiap penurunan/arsip, karena arsip membuat snapshot
    // gatekeeping membuangnya dan submit Drill/Skip yang berjalan tidak punya entitas untuk diterapkan.
    const demoting = to === 'DRAFT' || to === 'ARCHIVED';
    if (demoting && (entity !== 'assessment-sets' || from === 'PUBLISHED') && (await entityHasActiveAttempts(tx, entity, id))) {
      throw activeAttemptsError();
    }

    const now = nowDate();
    let reviewedAt: Date | null = null;
    try {
      if (entity === 'modules') await tx.update(modules).set({ status: to, updatedAt: now }).where(eq(modules.id, id));
      else if (entity === 'sub-modules') await tx.update(subModules).set({ status: to, updatedAt: now }).where(eq(subModules.id, id));
      else {
        const [row] = await tx
          .update(assessmentSets)
          .set(to === 'PUBLISHED' ? { status: to, reviewedBy: actor.id, reviewedAt: now, updatedAt: now } : { status: to, updatedAt: now })
          .where(eq(assessmentSets.id, id))
          .returning({ reviewedAt: assessmentSets.reviewedAt });
        reviewedAt = row?.reviewedAt ?? null;
      }
    } catch (err) {
      if (isUnique(err)) throw new ApiError('PUBLISH_BLOCKED', { details: [{ path: `${type}:${id}`, code: 'BOSS_DUPLICATE_PUBLISHED', message: 'Sudah ada set serupa berstatus PUBLISHED.' }] });
      throw err;
    }
    await audit(tx, actor, 'CONTENT_STATUS_CHANGED', id, { entity, id, from, to, ...(confirmed ? { confirmed_by: actor.id } : {}) });
    return { id, entity, status: to, reviewed_at: iso(reviewedAt) };
  });
}

// ------------------------------------------------------------------ GET quality (K5)
export async function getQuality(db: Db, setId: string) {
  const [set] = await db.select({ id: assessmentSets.id, questionsJson: assessmentSets.questionsJson }).from(assessmentSets).where(eq(assessmentSets.id, setId)).limit(1);
  if (!set) throw notFound();
  const r = await db.execute(sql`
    SELECT aa.question_id, count(*)::int AS n, (count(*) FILTER (WHERE aa.is_correct))::int AS correct
    FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
    WHERE aa.assessment_set_id = ${setId}::uuid AND aa.is_correct IS NOT NULL AND a.status IN ('GRADED', 'EXPIRED')
    GROUP BY aa.question_id`);
  const stats = new Map((r.rows as Row[]).map((x) => [x.question_id as string, { n: Number(x.n), correct: Number(x.correct) }]));
  const questions = (Array.isArray(set.questionsJson) ? (set.questionsJson as Row[]) : []).map((q) => {
    const s = stats.get(q.question_id) ?? { n: 0, correct: 0 };
    return { question_id: String(q.question_id), attempts_count: s.n, correct_rate: correctRate(s.correct, s.n), flag: qualityFlag(s.correct, s.n) };
  });
  return { set_id: setId, questions };
}

// ------------------------------------------------------------------ revisi
export async function listRevisions(db: Db, q: { entity_type: string; entity_id: string; page: number; page_size: number }) {
  const where = and(eq(contentRevisions.entityType, q.entity_type), eq(contentRevisions.entityId, q.entity_id));
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(contentRevisions).where(where)) as [{ n: number }];
  const rows = await db
    .select({ r: contentRevisions, name: users.displayName })
    .from(contentRevisions)
    .leftJoin(users, eq(users.id, contentRevisions.changedBy))
    .where(where)
    .orderBy(desc(contentRevisions.version))
    .limit(q.page_size)
    .offset((q.page - 1) * q.page_size);
  return { data: rows.map(({ r, name }) => revisionDto(r, name)), meta: { page: q.page, page_size: q.page_size, total: Number(n) } };
}

function revisionDto(r: typeof contentRevisions.$inferSelect, name: string | null) {
  return { id: r.id, entity_type: r.entityType, entity_id: r.entityId, version: r.version, changed_by_name: name, import_batch_id: r.importBatchId, created_at: r.createdAt.toISOString() };
}

export async function getRevision(db: Db, revisionId: string) {
  const [row] = await db
    .select({ r: contentRevisions, name: users.displayName })
    .from(contentRevisions)
    .leftJoin(users, eq(users.id, contentRevisions.changedBy))
    .where(eq(contentRevisions.id, revisionId))
    .limit(1);
  if (!row) throw notFound();
  return { ...revisionDto(row.r, row.name), snapshot: row.r.snapshot };
}

export const CurationService = { getCurriculum, getSubModuleDetail, updateModule, updateSubModule, updateMaterial, listSets, getSetDetail, updateSet, updateQuestion, changeStatus, getQuality, listRevisions, getRevision };
