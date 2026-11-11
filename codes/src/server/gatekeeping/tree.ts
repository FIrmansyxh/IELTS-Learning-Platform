import { sql } from 'drizzle-orm';
import type { CurriculumTree, TrackItem, TrackView } from '@/contracts/curriculum';
import type { Db } from '../db';
import { recomputeStatuses } from './service';
import {
  bossState,
  isAvailable,
  lockReasonOf,
  moduleAvailable,
  moduleProgressPercent,
  skipEligible,
  subProgressPercent,
  tierProgressPercent,
  type ModuleNode,
  type Snapshot,
  type SubNode,
  type TierNode,
} from './rules';
import { execute } from '@/server/db';
import { notFound } from '../http/errors';
import { findSubContext, trackLockReasonOf } from './track';
import { getCheckpointInfo } from '../tracks/checkpoint';

interface PublishedSet {
  id: string;
  type: string;
  moduleId: string | null;
  tierId: string | null;
  timeLimit: number;
  questionCount: number;
}

async function loadSets(db: Parameters<Parameters<Db['transaction']>[0]>[0]): Promise<PublishedSet[]> {
  const res = await execute(db, sql`
    SELECT id, assessment_type, module_id, tier_id, time_limit_seconds, question_count
    FROM assessment_sets
    WHERE status = 'PUBLISHED' AND assessment_type IN ('SKIP_MODULE_TEST', 'SKIP_TIER_TEST', 'TIER_BOSS_EXAM')
    ORDER BY created_at, id`);
  return (res.rows as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    type: r.assessment_type as string,
    moduleId: (r.module_id as string | null) ?? null,
    tierId: (r.tier_id as string | null) ?? null,
    timeLimit: Number(r.time_limit_seconds),
    questionCount: Number(r.question_count),
  }));
}

const NO_SKIP = (threshold: number) => ({
  available: false,
  assessment_set_id: null,
  threshold_percent: threshold,
  time_limit_seconds: null,
  question_count: null,
});

function skipDto(set: PublishedSet | undefined, eligible: boolean, threshold: number) {
  if (!set || !eligible) return NO_SKIP(threshold);
  return {
    available: true,
    assessment_set_id: set.id,
    threshold_percent: threshold,
    time_limit_seconds: set.timeLimit,
    question_count: set.questionCount,
  };
}

/** Bangun respons pohon dari snapshot yang sudah dihitung ulang (D1-D9). */
export function buildTree(snap: Snapshot, sets: PublishedSet[]): { tiers: CurriculumTree['tiers'] } {
  const first = (type: string, pred: (s: PublishedSet) => boolean) => sets.find((s) => s.type === type && pred(s));
  return {
    tiers: snap.tiers.map((tier: TierNode) => {
      const bossSet = first('TIER_BOSS_EXAM', (s) => s.tierId === tier.id);
      const boss = bossState(tier, bossSet !== undefined);
      const tierSkipSet = first('SKIP_TIER_TEST', (s) => s.tierId === tier.id);
      const mods = [...tier.modules].sort((a, b) => a.order - b.order);
      return {
        id: tier.id,
        tier_number: tier.number,
        title: tier.title,
        cefr_level: tier.cefr,
        target_band_min: tier.bandMin,
        target_band_max: tier.bandMax,
        status: tier.status,
        unlock_source: tier.status === 'LOCKED' ? null : tier.unlockSource,
        progress_percent: tierProgressPercent(tier),
        boss: {
          available: boss.available,
          blocked_reason: boss.blocked,
          gate_type: tier.gateType,
          gate_value: tier.gateValue,
          assessment_set_id: bossSet?.id ?? null,
          best_percent: tier.bossBestPercent,
          best_band: tier.bossBestBand,
          passed_at: tier.bossPassedAt ? tier.bossPassedAt.toISOString() : null,
        },
        skip_test: skipDto(tierSkipSet, skipEligible(tier.status) && tier.modules.some(moduleAvailable), tier.skipThreshold),
        modules: mods.map((mod: ModuleNode) => {
          const moduleSkipSet = first('SKIP_MODULE_TEST', (s) => s.moduleId === mod.id);
          const available = mod.review === 'PUBLISHED' && moduleAvailable(mod);
          return {
            id: mod.id,
            module_code: mod.code,
            skill_category: mod.skill as CurriculumTree['tiers'][number]['modules'][number]['skill_category'],
            title: mod.title,
            order_index: mod.order,
            status: mod.status,
            content_state: available ? ('AVAILABLE' as const) : ('COMING_SOON' as const),
            progress_percent: moduleProgressPercent(mod),
            skip_test: skipDto(moduleSkipSet, available && skipEligible(mod.status), tier.skipThreshold),
            sub_modules: [...mod.subs]
              .sort((a, b) => a.order - b.order)
              .map((sub) => ({
                id: sub.id,
                sub_module_code: sub.code,
                title: sub.title,
                order_index: sub.order,
                status: sub.status,
                content_state: isAvailable(mod, sub) ? ('AVAILABLE' as const) : ('COMING_SOON' as const),
                mastery_crown: sub.crown,
                best_score_percent: sub.best,
                progress_percent: subProgressPercent(sub),
                has_mini_task: sub.hasMiniTask,
                lock_reason: lockReasonOf(tier, mod, sub),
              })),
          };
        }),
      };
    }),
  };
}

async function loadTrackView(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  userId: string,
  snap: Snapshot,
  trackCode?: string,
): Promise<TrackView> {
  type TargetTrack = {
    id: string;
    code: string;
    title: string;
    kind: 'CURRICULUM' | 'CURATED';
    layout: 'LIST' | 'SPRINT';
    delivery_style_default: 'LEARN_FIRST' | 'PRACTICE_FIRST' | 'CASE_BASED';
  };
  let trackRow: TargetTrack;
  let activeTrackId: string | null = null;

  if (trackCode) {
    const res = await execute(
      tx,
      sql`SELECT u.active_track_id, t.id, t.code, t.title, t.kind, t.layout, t.delivery_style_default
          FROM users u
          LEFT JOIN learning_tracks t ON t.code = ${trackCode} AND t.status = 'PUBLISHED'
          WHERE u.id = ${userId}`,
    );
    const row = res.rows[0] as (TargetTrack & { active_track_id: string | null }) | undefined;
    if (!row || !row.id) throw notFound();
    trackRow = row;
    activeTrackId = row.active_track_id;
  } else {
    const res = await execute(
      tx,
      sql`SELECT u.active_track_id,
                 COALESCE(t.id, def.id) AS id,
                 COALESCE(t.code, def.code) AS code,
                 COALESCE(t.title, def.title) AS title,
                 COALESCE(t.kind, def.kind) AS kind,
                 COALESCE(t.layout, def.layout) AS layout,
                 COALESCE(t.delivery_style_default, def.delivery_style_default) AS delivery_style_default
          FROM users u
          LEFT JOIN learning_tracks t ON t.id = u.active_track_id AND t.status = 'PUBLISHED'
          LEFT JOIN learning_tracks def ON def.code = 'GT-STRUCT' AND def.status = 'PUBLISHED'
          WHERE u.id = ${userId}`,
    );
    const row = res.rows[0] as (TargetTrack & { active_track_id: string | null }) | undefined;
    if (!row || !row.id) throw notFound();
    trackRow = row;
    activeTrackId = row.active_track_id;
  }

  const isActive = trackRow.id === activeTrackId || (!activeTrackId && trackRow.code === 'GT-STRUCT');

  const items: TrackItem[] = [];

  if (trackRow.kind === 'CURRICULUM') {
    let position = 1;
    for (const tier of [...snap.tiers].sort((a, b) => a.number - b.number)) {
      for (const mod of [...tier.modules].sort((a, b) => a.order - b.order)) {
        for (const sub of [...mod.subs].sort((a, b) => a.order - b.order)) {
          const available = isAvailable(mod, sub);
          items.push({
            position: position++,
            kind: 'SUB_MODULE',
            item_id: null,
            week_no: null,
            day_no: null,
            sub_module: {
              id: sub.id,
              sub_module_code: sub.code,
              title: sub.title,
              order_index: sub.order,
              status: sub.status,
              content_state: available ? 'AVAILABLE' : 'COMING_SOON',
              mastery_crown: sub.crown,
              best_score_percent: sub.best,
              progress_percent: subProgressPercent(sub),
              has_mini_task: sub.hasMiniTask,
              lock_reason: lockReasonOf(tier, mod, sub),
            },
            checkpoint: null,
          });
        }
      }
    }
  } else {
    const itemRows = await execute(
      tx,
      sql`SELECT lti.id, lti.item_kind, lti.sub_module_id, lti.order_index, lti.week_no, lti.day_no
          FROM learning_track_items lti
          WHERE lti.track_id = ${trackRow.id}
          ORDER BY lti.order_index ASC`,
    );

    let prevAvailableSub: SubNode | null = null;
    let position = 1;

    for (const r of itemRows.rows as Array<{
      id: string;
      item_kind: 'SUB_MODULE' | 'CHECKPOINT';
      sub_module_id: string | null;
      order_index: number;
      week_no: number | null;
      day_no: number | null;
    }>) {
      if (r.item_kind === 'CHECKPOINT') {
        const cpInfo = await getCheckpointInfo(userId, trackRow.id, r.id, tx);
        items.push({
          position: position++,
          kind: 'CHECKPOINT',
          item_id: r.id,
          week_no: r.week_no,
          day_no: r.day_no,
          sub_module: null,
          checkpoint: {
            ...cpInfo,
            pass_percent: 75,
          },
        });
      } else {
        const ctx = findSubContext(snap, (s) => s.id === r.sub_module_id);
        if (!ctx) continue;
        const { tier, mod, sub } = ctx;
        const available = isAvailable(mod, sub);
        const lockReason = trackLockReasonOf(
          tier,
          mod,
          sub,
          { id: trackRow.id, code: trackRow.code, kind: trackRow.kind },
          prevAvailableSub,
        );
        if (available) prevAvailableSub = sub;

        items.push({
          position: position++,
          kind: 'SUB_MODULE',
          item_id: r.id,
          week_no: r.week_no,
          day_no: r.day_no,
          sub_module: {
            id: sub.id,
            sub_module_code: sub.code,
            title: sub.title,
            order_index: sub.order,
            status: sub.status,
            content_state: available ? 'AVAILABLE' : 'COMING_SOON',
            mastery_crown: sub.crown,
            best_score_percent: sub.best,
            progress_percent: subProgressPercent(sub),
            has_mini_task: sub.hasMiniTask,
            lock_reason: lockReason,
          },
          checkpoint: null,
        });
      }
    }
  }

  return {
    code: trackRow.code,
    title: trackRow.title,
    layout: trackRow.layout,
    delivery_style_default: trackRow.delivery_style_default,
    is_active: isActive,
    items,
  };
}

/** GET /curriculum/tree: ensure + recompute (satu transaksi) lalu baca. */
export async function getCurriculumTree(db: Db, userId: string, trackCode?: string): Promise<CurriculumTree> {
  return db.transaction(async (tx) => {
    const snap = await recomputeStatuses(tx, userId);
    const sets = await loadSets(tx);
    const baseTree = buildTree(snap, sets);
    const track = await loadTrackView(tx, userId, snap, trackCode);
    return {
      tiers: baseTree.tiers,
      track,
    };
  });
}
