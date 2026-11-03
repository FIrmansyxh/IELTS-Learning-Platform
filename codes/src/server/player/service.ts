/**
 * PlayerService (SPEC-005). SATU-SATUNYA penulis `learn_active_seconds`, `learn_visited_subtabs`, `learn_last_ping_at`,
 * `learn_completed_at`, dan `mini_task_completed_at` pada user_sub_module_progress. Status/skor tetap milik
 * GatekeepingService (dibaca lewat snapshot; gerbang akses lewat `assertSubModuleAccessible`).
 */
import { and, asc, desc, eq } from 'drizzle-orm';
import { assessmentSets, subModules, userSubModuleProgress as usmp } from '@/db/schema';
import type { SubModuleDetail } from '@/contracts/player';
import type { Tx } from '../db';
import { nowDate } from '../clock';
import { runActivityHooks } from '../activity/hooks';
import { assertSubModuleAccessible, markStarted, recomputeStatuses } from '../gatekeeping/service';
import { chainOf, passOf, subProgressPercent, type SubNode } from '../gatekeeping/rules';
import { ApiError, notFound, validationError } from '../http/errors';
import { logger } from '../logger';
import { getSetting } from '../settings/service';
import { loadMaterial, type Material } from './material';
import { checkLearnReady, learnDelta, mergeSubtabs, type Subtab } from './rules';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

async function loadLearnRow(tx: Tx, userId: string, subModuleId: string, lock: boolean) {
  const q = tx
    .select({
      learnActiveSeconds: usmp.learnActiveSeconds,
      learnVisitedSubtabs: usmp.learnVisitedSubtabs,
      learnLastPingAt: usmp.learnLastPingAt,
      learnCompletedAt: usmp.learnCompletedAt,
      miniTaskCompletedAt: usmp.miniTaskCompletedAt,
    })
    .from(usmp)
    .where(and(eq(usmp.userId, userId), eq(usmp.subModuleId, subModuleId)))
    .limit(1);
  const [row] = await (lock ? q.for('update') : q);
  if (!row) throw notFound();
  return row;
}

async function requireMaterial(tx: Tx, subModuleId: string): Promise<Material> {
  const m = await loadMaterial(tx, subModuleId);
  if (!m) {
    logger.error({ subModuleId }, 'material_missing');
    throw notFound();
  }
  return m;
}

/** Set Active Drill PUBLISHED sub-modul; bila ganda: `version` tertinggi lalu `id` terkecil (+ warn). */
export async function findPublishedDrill(tx: Tx, subModuleId: string) {
  const rows = await tx
    .select({
      id: assessmentSets.id,
      questionCount: assessmentSets.questionCount,
      timeLimitSeconds: assessmentSets.timeLimitSeconds,
      passPercent: assessmentSets.passPercent,
    })
    .from(assessmentSets)
    .where(and(eq(assessmentSets.subModuleId, subModuleId), eq(assessmentSets.assessmentType, 'ACTIVE_DRILL'), eq(assessmentSets.status, 'PUBLISHED')))
    .orderBy(desc(assessmentSets.version), asc(assessmentSets.id));
  if (rows.length > 1) logger.warn({ subModuleId, count: rows.length }, 'multiple_published_drills');
  return rows[0] ?? null;
}

/** GET /sub-modules/{code}: akses (403/404), markStarted, lalu susun respons tanpa kolom internal. */
export async function getSubModuleDetail(tx: Tx, userId: string, code: string): Promise<SubModuleDetail> {
  const [row] = await tx
    .select({ id: subModules.id, contentVersion: subModules.contentVersion })
    .from(subModules)
    .where(eq(subModules.subModuleCode, code))
    .limit(1);
  if (!row) throw notFound();
  await assertSubModuleAccessible(tx, userId, row.id); // 404 (DRAFT/ARCHIVED/bukan AVAILABLE) atau 403 LOCKED_CONTENT
  await markStarted(tx, userId, row.id);
  const snap = await recomputeStatuses(tx, userId);

  let located: { tier: (typeof snap.tiers)[number]; mod: (typeof snap.tiers)[number]['modules'][number]; sub: SubNode } | undefined;
  for (const tier of snap.tiers) for (const mod of tier.modules) for (const sub of mod.subs) if (sub.id === row.id) located = { tier, mod, sub };
  if (!located) throw notFound();
  const { tier, mod, sub } = located;

  const material = await requireMaterial(tx, row.id);
  const learn = await loadLearnRow(tx, userId, row.id, false);
  const min = await getSetting<number>(tx, 'learn.min_active_seconds');
  const ready = checkLearnReady({
    activeSeconds: learn.learnActiveSeconds,
    visited: learn.learnVisitedSubtabs,
    minSeconds: min,
    hasVideos: material.videos.length > 0,
    hasSlides: material.slides.length > 0,
  }).ready;

  const drillSet = await findPublishedDrill(tx, row.id);
  const drillLimit = await getSetting<number>(tx, 'drill.question_count');
  const learnDone = learn.learnCompletedAt !== null;

  const chain = chainOf(tier);
  const idx = chain.findIndex((c) => c.sub.id === sub.id);

  return {
    sub_module: {
      id: sub.id,
      sub_module_code: sub.code,
      title: sub.title,
      passing_score_percent: sub.passing,
      content_version: row.contentVersion,
      module: {
        id: mod.id,
        module_code: mod.code,
        title: mod.title,
        skill_category: mod.skill as SubModuleDetail['sub_module']['module']['skill_category'],
      },
      tier: { id: tier.id, tier_number: tier.number, title: tier.title },
    },
    material: {
      article_markdown: material.articleMarkdown,
      videos: material.videos,
      slides: material.slides,
      attachments: material.attachments,
      mini_task: material.miniTask,
      attribution_text: material.attributionText,
    },
    progress: {
      status: sub.status,
      progress_percent: subProgressPercent(sub),
      learn_completed_at: iso(learn.learnCompletedAt),
      mini_task_completed_at: iso(learn.miniTaskCompletedAt),
      best_score_percent: sub.best,
      mastery_crown: sub.crown,
      learn_active_seconds: learn.learnActiveSeconds,
      learn_visited_subtabs: learn.learnVisitedSubtabs.filter((s): s is Subtab => s === 'ARTICLE' || s === 'VIDEO' || s === 'SLIDES'),
      learn_ready: ready,
      min_active_seconds: min,
    },
    drill: {
      assessment_set_id: drillSet?.id ?? null,
      question_count: drillSet ? Math.min(drillSet.questionCount, drillLimit) : 0,
      time_limit_seconds: drillSet?.timeLimitSeconds ?? 0,
      pass_percent: drillSet ? (drillSet.passPercent ?? sub.passing) : passOf(sub),
      can_start: drillSet !== null && learnDone,
      blocked_reason: drillSet === null ? 'NO_DRILL_PUBLISHED' : learnDone ? null : 'LEARN_NOT_COMPLETED',
    },
    navigation: {
      prev_sub_module_code: idx > 0 ? chain[idx - 1]!.sub.code : null,
      next_sub_module_code: idx >= 0 && idx < chain.length - 1 ? chain[idx + 1]!.sub.code : null,
    },
  };
}

/** POST learn-progress: detik aktif di-clamp server (anti-farming); sub-tab ditambahkan tanpa duplikat. */
export async function recordLearnProgress(
  tx: Tx,
  userId: string,
  subModuleId: string,
  input: { subtab: Subtab; active_seconds: number },
) {
  await assertSubModuleAccessible(tx, userId, subModuleId);
  const material = await requireMaterial(tx, subModuleId);
  if ((input.subtab === 'VIDEO' && material.videos.length === 0) || (input.subtab === 'SLIDES' && material.slides.length === 0)) {
    throw validationError('subtab', 'subtab_unavailable', 'Tab ini tidak tersedia pada sub-modul ini.');
  }
  const row = await loadLearnRow(tx, userId, subModuleId, true); // serialkan ping serentak (dua tab browser)
  const now = nowDate();
  const delta = learnDelta(input.active_seconds, row.learnLastPingAt, now);
  const active = row.learnActiveSeconds + delta;
  const visited = mergeSubtabs(row.learnVisitedSubtabs, input.subtab);
  await tx
    .update(usmp)
    .set({ learnActiveSeconds: active, learnVisitedSubtabs: visited, learnLastPingAt: now, updatedAt: now })
    .where(and(eq(usmp.userId, userId), eq(usmp.subModuleId, subModuleId)));
  const min = await getSetting<number>(tx, 'learn.min_active_seconds');
  const { ready } = checkLearnReady({
    activeSeconds: active,
    visited,
    minSeconds: min,
    hasVideos: material.videos.length > 0,
    hasSlides: material.slides.length > 0,
  });
  return { learn_active_seconds: active, learn_visited_subtabs: visited, learn_ready: ready };
}

/** POST learn-complete: idempoten; syarat dihitung ulang di server. */
export async function completeLearn(tx: Tx, userId: string, subModuleId: string) {
  await assertSubModuleAccessible(tx, userId, subModuleId);
  const material = await requireMaterial(tx, subModuleId);
  const row = await loadLearnRow(tx, userId, subModuleId, true);
  const drill = await findPublishedDrill(tx, subModuleId);
  if (row.learnCompletedAt) return { learn_completed_at: row.learnCompletedAt.toISOString(), drill_can_start: drill !== null };

  const min = await getSetting<number>(tx, 'learn.min_active_seconds');
  const check = checkLearnReady({
    activeSeconds: row.learnActiveSeconds,
    visited: row.learnVisitedSubtabs,
    minSeconds: min,
    hasVideos: material.videos.length > 0,
    hasSlides: material.slides.length > 0,
  });
  if (!check.ready) throw new ApiError('LEARN_REQUIREMENTS_NOT_MET', { details: check.issues });

  const now = nowDate();
  await tx.update(usmp).set({ learnCompletedAt: now, updatedAt: now }).where(and(eq(usmp.userId, userId), eq(usmp.subModuleId, subModuleId)));
  await runActivityHooks(tx, { userId, kind: 'LEARN_COMPLETE', subModuleId });
  return { learn_completed_at: now.toISOString(), drill_can_start: drill !== null };
}

/** POST mini-task/complete: hanya SELF_CHECK; idempoten. */
export async function completeMiniTask(tx: Tx, userId: string, subModuleId: string) {
  await assertSubModuleAccessible(tx, userId, subModuleId);
  const material = await requireMaterial(tx, subModuleId);
  if (!material.miniTask) throw new ApiError('NO_MINI_TASK');
  if (material.miniTask.task_type !== 'SELF_CHECK') throw new ApiError('MINI_TASK_NOT_SELF_CHECK');
  const row = await loadLearnRow(tx, userId, subModuleId, true);
  if (row.learnCompletedAt === null) throw new ApiError('LEARN_NOT_COMPLETED');
  if (row.miniTaskCompletedAt) return { mini_task_completed_at: row.miniTaskCompletedAt.toISOString() };
  const now = nowDate();
  await tx.update(usmp).set({ miniTaskCompletedAt: now, updatedAt: now }).where(and(eq(usmp.userId, userId), eq(usmp.subModuleId, subModuleId)));
  await runActivityHooks(tx, { userId, kind: 'MINI_TASK_COMPLETE', subModuleId });
  return { mini_task_completed_at: now.toISOString() };
}
