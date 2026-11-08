import { sql } from 'drizzle-orm';
import type { CurriculumTree } from '@/contracts/curriculum';
import type { Db } from '../db';
import { recomputeStatuses } from './service';
import {
  bossState,
  isAvailable,
  isTerminal,
  lockReasonOf,
  moduleAvailable,
  moduleProgressPercent,
  skipEligible,
  subProgressPercent,
  tierProgressPercent,
  type ModuleNode,
  type Snapshot,
  type TierNode,
} from './rules';
import { execute } from '@/server/db';

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
export function buildTree(snap: Snapshot, sets: PublishedSet[]): CurriculumTree {
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
            progress_percent: isTerminal(mod.status) ? 100 : moduleProgressPercent(mod),
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

/** GET /curriculum/tree: ensure + recompute (satu transaksi) lalu baca. Keadaan tunak: 3 query SQL. */
export async function getCurriculumTree(db: Db, userId: string): Promise<CurriculumTree> {
  return db.transaction(async (tx) => {
    const snap = await recomputeStatuses(tx, userId);
    const sets = await loadSets(tx);
    return buildTree(snap, sets);
  });
}
