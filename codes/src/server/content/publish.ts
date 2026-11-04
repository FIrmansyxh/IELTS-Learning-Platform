import { eq, sql } from 'drizzle-orm';
import { assessmentSets, learningMaterials, modules, subModules } from '@/db/schema';
import { OBJECTIVE_TYPES, type QuestionType } from '@/contracts/content';
import { writeAudit } from '../audit';
import type { Tx } from '../db';
import { ApiError } from '../http/errors';

export type PublishEntityType = 'MODULE' | 'SUB_MODULE' | 'ASSESSMENT_SET';
export type ReviewStatusName = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

export interface Blocker {
  code:
    | 'ASSET_UNVERIFIED'
    | 'SOURCE_MISSING'
    | 'MATERIAL_MISSING'
    | 'DRILL_NOT_PUBLISHED'
    | 'NO_QUESTIONS'
    | 'NO_OBJECTIVE_QUESTIONS'
    | 'PLACEMENT_BANK_TOO_SMALL'
    | 'BOSS_SECTIONS_MISSING'
    | 'BOSS_DUPLICATE_PUBLISHED';
  entity_type: PublishEntityType;
  entity_id: string;
  detail: string;
  /** Hanya untuk `ASSET_UNVERIFIED`: id aset yang menghalangi (aditif, SPEC-020). */
  asset_id?: string;
}

type QuestionLite = { question_type: QuestionType; difficulty?: number };

/** Ambil `detail` aset UNVERIFIED dari v_publish_blockers lalu perkaya dengan asset_code / external_ref. */
async function viewBlockers(tx: Tx, entityType: 'LEARNING_MATERIAL' | 'ASSESSMENT_SET', entityId: string, as: PublishEntityType, as_id: string): Promise<Blocker[]> {
  const res = await tx.execute(sql`
    SELECT b.reason_code, b.detail, a.id AS asset_id, a.asset_code, a.external_ref
    FROM v_publish_blockers b
    LEFT JOIN content_assets a ON b.detail = 'asset ' || a.id::text
    WHERE b.entity_type = ${entityType} AND b.entity_id = ${entityId}::uuid`);
  return (res.rows as Array<{ reason_code: string; detail: string; asset_id: string | null; asset_code: string | null; external_ref: string | null }>).map((r) => ({
    code: r.reason_code as Blocker['code'],
    entity_type: as,
    entity_id: as_id,
    detail: r.asset_code || r.external_ref ? `${r.detail} (${r.asset_code ?? r.external_ref})` : r.detail,
    ...(r.asset_id ? { asset_id: r.asset_id } : {}),
  }));
}

export async function computeBlockers(tx: Tx, entityType: PublishEntityType, id: string): Promise<Blocker[]> {
  const out: Blocker[] = [];
  if (entityType === 'ASSESSMENT_SET') {
    const [set] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, id));
    if (!set) throw new ApiError('NOT_FOUND');
    out.push(...(await viewBlockers(tx, 'ASSESSMENT_SET', id, 'ASSESSMENT_SET', id)));
    const qs = (set.questionsJson as QuestionLite[]) ?? [];
    const b = (code: Blocker['code'], detail: string) => out.push({ code, entity_type: 'ASSESSMENT_SET', entity_id: id, detail });
    const t = set.assessmentType;
    if (t !== 'TIER_BOSS_EXAM' && set.questionCount === 0) b('NO_QUESTIONS', 'Set tidak memiliki soal.');
    const needsObjective =
      t === 'ACTIVE_DRILL' || t === 'SKIP_MODULE_TEST' || t === 'SKIP_TIER_TEST' || t === 'PLACEMENT_TEST' ||
      (t === 'BOSS_SECTION' && (set.skillCategory === 'LISTENING' || set.skillCategory === 'READING'));
    if (needsObjective && set.questionCount > 0 && !qs.some((q) => OBJECTIVE_TYPES.includes(q.question_type))) {
      b('NO_OBJECTIVE_QUESTIONS', 'Set tidak memiliki soal bertipe objektif.');
    }
    if (t === 'PLACEMENT_TEST') {
      const per = [1, 2, 3, 4, 5].map((d) => qs.filter((q) => q.difficulty === d).length);
      if (qs.length < 25 || per.some((n) => n < 5)) {
        b('PLACEMENT_BANK_TOO_SMALL', `Placement butuh >= 25 soal dan >= 5 per difficulty (ada ${qs.length}; per difficulty ${per.join('/')}).`);
      }
    }
    if (t === 'TIER_BOSS_EXAM') {
      const kids = await tx.select({ skill: assessmentSets.skillCategory }).from(assessmentSets).where(
        sql`${assessmentSets.parentSetId} = ${id}::uuid AND ${assessmentSets.status} = 'PUBLISHED'`,
      );
      const have = new Set(kids.map((k) => k.skill));
      if (!have.has('LISTENING') || !have.has('READING')) b('BOSS_SECTIONS_MISSING', 'Boss butuh anak LISTENING dan READING berstatus PUBLISHED.');
    }
    if (t === 'TIER_BOSS_EXAM' && set.tierId) {
      // QA F-14-01: satu induk Boss PUBLISHED per Tier (unique index assessment_sets_boss_tier_published_uq).
      const [other] = await tx.select({ id: assessmentSets.id }).from(assessmentSets).where(
        sql`${assessmentSets.assessmentType} = 'TIER_BOSS_EXAM' AND ${assessmentSets.status} = 'PUBLISHED' AND ${assessmentSets.tierId} = ${set.tierId}::uuid AND ${assessmentSets.id} <> ${id}::uuid`,
      );
      if (other) b('BOSS_DUPLICATE_PUBLISHED', `Tier ini sudah punya Boss PUBLISHED (${other.id}); arsipkan dulu.`);
    }
    if (t === 'BOSS_SECTION' && set.parentSetId && set.skillCategory) {
      // QA F-14-01: satu anak PUBLISHED per skill per induk (assessment_sets_boss_child_skill_uq).
      const [other] = await tx.select({ id: assessmentSets.id }).from(assessmentSets).where(
        sql`${assessmentSets.assessmentType} = 'BOSS_SECTION' AND ${assessmentSets.status} = 'PUBLISHED' AND ${assessmentSets.parentSetId} = ${set.parentSetId}::uuid AND ${assessmentSets.skillCategory} = ${set.skillCategory} AND ${assessmentSets.id} <> ${id}::uuid`,
      );
      if (other) b('BOSS_DUPLICATE_PUBLISHED', `Induk ini sudah punya section ${set.skillCategory} PUBLISHED (${other.id}); arsipkan dulu.`);
    }
  } else if (entityType === 'SUB_MODULE') {
    const [sub] = await tx.select({ id: subModules.id }).from(subModules).where(eq(subModules.id, id));
    if (!sub) throw new ApiError('NOT_FOUND');
    const [lm] = await tx.select({ id: learningMaterials.id }).from(learningMaterials).where(eq(learningMaterials.subModuleId, id));
    if (!lm) out.push({ code: 'MATERIAL_MISSING', entity_type: 'SUB_MODULE', entity_id: id, detail: 'Sub-modul belum memiliki materi.' });
    else out.push(...(await viewBlockers(tx, 'LEARNING_MATERIAL', lm.id, 'SUB_MODULE', id)));
    const drills = await tx.select({ id: assessmentSets.id }).from(assessmentSets).where(
      sql`${assessmentSets.subModuleId} = ${id}::uuid AND ${assessmentSets.assessmentType} = 'ACTIVE_DRILL' AND ${assessmentSets.status} = 'PUBLISHED'`,
    );
    if (drills.length === 0) out.push({ code: 'DRILL_NOT_PUBLISHED', entity_type: 'SUB_MODULE', entity_id: id, detail: 'Belum ada Active Drill berstatus PUBLISHED.' });
  } else {
    const [mod] = await tx.select({ id: modules.id }).from(modules).where(eq(modules.id, id));
    if (!mod) throw new ApiError('NOT_FOUND');
  }
  return out;
}

export type PublishResult = { published: true } | { published: false; blockers: Blocker[] };

/** PublishService.publish: hitung penghalang; bila kosong set status PUBLISHED + audit CONTENT_PUBLISHED. */
export async function publish(
  tx: Tx,
  entityType: PublishEntityType,
  id: string,
  actor: { userId: string | null },
): Promise<PublishResult> {
  const blockers = await computeBlockers(tx, entityType, id);
  if (blockers.length > 0) return { published: false, blockers };
  await setStatus(tx, entityType, id, 'PUBLISHED', actor.userId);
  await writeAudit(tx, {
    actorUserId: actor.userId,
    action: 'CONTENT_PUBLISHED',
    entityType: entityType.toLowerCase(),
    entityId: id,
  });
  return { published: true };
}

async function setStatus(tx: Tx, entityType: PublishEntityType, id: string, status: ReviewStatusName, userId: string | null) {
  const now = new Date();
  if (entityType === 'MODULE') await tx.update(modules).set({ status, updatedAt: now }).where(eq(modules.id, id));
  else if (entityType === 'SUB_MODULE') await tx.update(subModules).set({ status, updatedAt: now }).where(eq(subModules.id, id));
  else {
    await tx
      .update(assessmentSets)
      .set(status === 'PUBLISHED' ? { status, reviewedBy: userId, reviewedAt: now, updatedAt: now } : { status, updatedAt: now })
      .where(eq(assessmentSets.id, id));
  }
}

async function currentStatus(tx: Tx, entityType: PublishEntityType, id: string): Promise<ReviewStatusName> {
  const table = entityType === 'MODULE' ? modules : entityType === 'SUB_MODULE' ? subModules : assessmentSets;
  const [row] = await tx.select({ status: table.status }).from(table).where(eq(table.id, id));
  if (!row) throw new ApiError('NOT_FOUND');
  return row.status;
}

/** Transisi diizinkan: mana saja kecuali dari ARCHIVED yang hanya boleh ke DRAFT. Target PUBLISHED menjalankan publish. */
export async function changeStatus(
  tx: Tx,
  entityType: PublishEntityType,
  id: string,
  target: ReviewStatusName,
  actor: { userId: string | null },
): Promise<PublishResult> {
  const from = await currentStatus(tx, entityType, id);
  if (from === target) return { published: true };
  if (from === 'ARCHIVED' && target !== 'DRAFT') {
    throw new ApiError('INVALID_STATUS_TRANSITION', { status: 409, message: 'Transisi status tidak diizinkan.' });
  }
  if (target === 'PUBLISHED') return publish(tx, entityType, id, actor);
  await setStatus(tx, entityType, id, target, actor.userId);
  await writeAudit(tx, {
    actorUserId: actor.userId,
    action: 'CONTENT_STATUS_CHANGED',
    entityType: entityType.toLowerCase(),
    entityId: id,
    metadata: { from, to: target },
  });
  return { published: true };
}

export const PublishService = { publish, changeStatus, computeBlockers };
