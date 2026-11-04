/**
 * GamificationService (SPEC-016). SATU-SATUNYA penulis `user_stats` dan `point_ledger` (append-only; `app_rw` tidak
 * punya UPDATE/DELETE) serta `user_sub_module_progress.mastery_crown`. Semua tulis terjadi di dalam transaksi pemicu
 * (submit attempt, learn-complete, Mini-Task) sehingga kegagalan membatalkan seluruh pemicu tanpa poin parsial.
 *
 * Anti-abuse:
 * - Poin tidak dapat diklaim ganda: indeks unik parsial `point_ledger_once_uq` (user, source, source_id) + `ON CONFLICT DO NOTHING`
 *   + kunci baris `user_stats` (`FOR UPDATE`) yang menyerialkan seluruh penulisan poin satu pengguna.
 * - Tidak ada farming PRACTICE: poin Drill/Speed/Mahkota hanya selisih positif terhadap total yang sudah diberikan untuk
 *   SET yang sama (G3), jadi mengulang attempt tak menambah apa pun kecuali memperbaiki skor.
 * - Streak harian memakai jam server dan `APP_TIMEZONE`; klien tidak mengirim zona/waktu apa pun.
 */
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { attemptAnswers, pointLedger, subModules, userStats } from '@/db/schema';
import type { GamificationBlock, StatsDTOType } from '@/contracts/gamification';
import type { Db, DbOrTx, Tx } from '../db';
import { nowDate } from '../clock';
import type { ActivityEvent } from '../activity/hooks';
import type { AttemptCompletedContext } from '../attempts/hooks';
import { getSetting } from '../settings/service';
import {
  appTimezone,
  crownFromScore,
  crownRank,
  crownValue,
  drillCounts,
  incrementalPoints,
  maxCrown,
  streakStep,
  streakView,
  type CrownLevel,
} from './rules';

type StatsRow = typeof userStats.$inferSelect;
type LedgerSource = 'DRILL' | 'SPEED_STREAK' | 'CROWN' | 'MINI_TASK' | 'BOSS' | 'DAILY';

// ------------------------------------------------------------------ user_stats
/** Hook `userCreatedHooks`: baris statistik kosong untuk pengguna baru (idempoten). */
export async function createStatsRow(tx: DbOrTx, userId: string): Promise<void> {
  await tx.execute(sql`INSERT INTO user_stats (user_id) VALUES (${userId}::uuid) ON CONFLICT DO NOTHING`);
}

/** Buat bila belum ada (pengguna lama) lalu kunci baris: menyerialkan semua tulis poin/streak pengguna ini. */
async function lockStats(tx: Tx, userId: string): Promise<StatsRow> {
  await createStatsRow(tx, userId);
  const [row] = await tx.select().from(userStats).where(eq(userStats.userId, userId)).limit(1).for('update');
  return row!;
}

async function addTotal(tx: Tx, userId: string, points: number): Promise<void> {
  if (points === 0) return;
  await tx.execute(sql`UPDATE user_stats SET total_points = total_points + ${points}, updated_at = now() WHERE user_id = ${userId}::uuid`);
}

// ------------------------------------------------------------------ ledger
/** Tulis satu baris ledger; false bila indeks unik menolak (sudah pernah diberikan) atau poin <= 0. */
async function insertLedger(tx: Tx, e: { userId: string; source: LedgerSource; sourceId: string | null; points: number; note: string }): Promise<boolean> {
  if (e.points <= 0) return false;
  const r = await tx.execute(sql`
    INSERT INTO point_ledger (user_id, source, source_id, points, note)
    VALUES (${e.userId}::uuid, ${e.source}::point_source, ${e.sourceId}::uuid, ${e.points}, ${e.note.slice(0, 200)})
    ON CONFLICT DO NOTHING
    RETURNING id`);
  return r.rows.length > 0;
}

/** G3: total yang sudah diberikan untuk `source` pada attempt-attempt user di set yang sama (selain attempt ini). */
async function alreadyAwarded(tx: Tx, userId: string, source: LedgerSource, setId: string, exceptAttemptId: string): Promise<number> {
  const r = await tx.execute(sql`
    SELECT COALESCE(SUM(pl.points), 0)::int AS total
    FROM point_ledger pl
    WHERE pl.user_id = ${userId}::uuid AND pl.source = ${source}::point_source
      AND pl.source_id IN (SELECT a.id FROM attempts a WHERE a.user_id = ${userId}::uuid AND a.assessment_set_id = ${setId}::uuid AND a.id <> ${exceptAttemptId}::uuid)`);
  return Number((r.rows[0] as { total: number }).total);
}

async function subModuleCode(tx: Tx, subModuleId: string | null): Promise<string> {
  if (!subModuleId) return '';
  const [s] = await tx.select({ code: subModules.subModuleCode }).from(subModules).where(eq(subModules.id, subModuleId)).limit(1);
  return s?.code ?? '';
}

// ------------------------------------------------------------------ aktivitas harian (G7)
export interface ActivityOutcome {
  dailyPoints: number;
  dailyStreakDays: number;
}

async function recordActivityLocked(tx: Tx, userId: string, now: Date, stats: StatsRow): Promise<ActivityOutcome> {
  const step = streakStep(
    { dailyStreakDays: stats.dailyStreakDays, longestDailyStreak: stats.longestDailyStreak, lastActive: stats.lastActiveDate },
    now,
    appTimezone(),
  );
  if (!step.changed) return { dailyPoints: 0, dailyStreakDays: stats.dailyStreakDays };
  const daily = await getSetting<number>(tx, 'points.daily_activity');
  await tx.execute(sql`
    UPDATE user_stats SET daily_streak_days = ${step.dailyStreakDays}, longest_daily_streak = ${step.longestDailyStreak},
           last_active_date = ${now.toISOString()}::timestamptz, updated_at = now()
    WHERE user_id = ${userId}::uuid`);
  const wrote = await insertLedger(tx, { userId, source: 'DAILY', sourceId: null, points: daily, note: 'Aktivitas harian' });
  const dailyPoints = wrote ? daily : 0;
  await addTotal(tx, userId, dailyPoints);
  return { dailyPoints, dailyStreakDays: step.dailyStreakDays };
}

/** G7: catat aktivitas belajar hari ini (sekali per hari lokal `APP_TIMEZONE`). Dipakai juga oleh hook aktivitas. */
export async function recordActivity(tx: Tx, userId: string, now: Date = nowDate()): Promise<ActivityOutcome> {
  return recordActivityLocked(tx, userId, now, await lockStats(tx, userId));
}

// ------------------------------------------------------------------ hook aktivitas (learn-complete, Mini-Task)
/**
 * `activityHooks`: LEARN_COMPLETE -> aktivitas harian; MINI_TASK_COMPLETE -> poin Mini-Task sekali per sub-modul (G6)
 * + aktivitas harian. DRILL_SUBMIT diabaikan di sini (ditangani `gamificationHook` karena butuh tipe set).
 */
export async function activityHook(tx: Tx, e: ActivityEvent): Promise<void> {
  if (e.kind === 'LEARN_COMPLETE') {
    await recordActivity(tx, e.userId);
    return;
  }
  if (e.kind !== 'MINI_TASK_COMPLETE') return;
  const stats = await lockStats(tx, e.userId);
  if (e.subModuleId) {
    const pts = await getSetting<number>(tx, 'points.mini_task');
    const code = await subModuleCode(tx, e.subModuleId);
    const wrote = await insertLedger(tx, { userId: e.userId, source: 'MINI_TASK', sourceId: e.subModuleId, points: pts, note: `Mini-Task ${code}`.trim() });
    if (wrote) await addTotal(tx, e.userId, pts);
  }
  await recordActivityLocked(tx, e.userId, nowDate(), stats);
}

// ------------------------------------------------------------------ hook attempt selesai (G1-G5, G8)
interface CrownStep {
  previous: CrownLevel;
  current: CrownLevel;
  changed: boolean;
}

/** G4: tulis mahkota baru bila lebih tinggi (tidak pernah turun). Mengunci baris progres sub-modul. */
async function applyCrown(tx: Tx, p: { userId: string; subModuleId: string; computed: CrownLevel }): Promise<CrownStep> {
  const r = await tx.execute(sql`
    SELECT mastery_crown FROM user_sub_module_progress
    WHERE user_id = ${p.userId}::uuid AND sub_module_id = ${p.subModuleId}::uuid FOR UPDATE`);
  const row = r.rows[0] as { mastery_crown: CrownLevel } | undefined;
  const previous: CrownLevel = row?.mastery_crown ?? 'NONE';
  const current = maxCrown(previous, p.computed);
  if (row && crownRank(current) > crownRank(previous)) {
    await tx.execute(sql`
      UPDATE user_sub_module_progress SET mastery_crown = ${current}::mastery_crown, updated_at = now()
      WHERE user_id = ${p.userId}::uuid AND sub_module_id = ${p.subModuleId}::uuid`);
    return { previous, current, changed: true };
  }
  return { previous, current: previous, changed: false };
}

const emptyPoints = () => ({ drill: 0, speed_streak: 0, crown: 0, boss: 0, daily: 0, total: 0 });

export async function gamificationHook(ctx: AttemptCompletedContext): Promise<void> {
  const { tx, userId, attempt, set, result } = ctx;
  const type = set.assessmentType;
  const now = nowDate();

  if (type === 'ACTIVE_DRILL' && set.subModuleId) {
    const [silverMin, goldMin, correctPts, speedMin, speedBonus, crownSilver, crownGold] = await Promise.all([
      getSetting<number>(tx, 'crown.silver_min'),
      getSetting<number>(tx, 'crown.gold_min'),
      getSetting<number>(tx, 'points.correct_answer'),
      getSetting<number>(tx, 'points.speed_streak_min'),
      getSetting<number>(tx, 'points.speed_streak_bonus'),
      getSetting<number>(tx, 'points.crown_silver'),
      getSetting<number>(tx, 'points.crown_gold'),
    ]);
    const code = await subModuleCode(tx, set.subModuleId);

    // Urutan kunci: progres sub-modul (dipegang transaksi ini sejak handler) lalu user_stats.
    const computed = crownFromScore({ passed: result.passed, rawH: result.rawH, maxH: result.maxH, silverMin, goldMin });
    const crown = await applyCrown(tx, { userId, subModuleId: set.subModuleId, computed });
    const stats = await lockStats(tx, userId);

    const answers = await tx.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attempt.id));
    const counts = drillCounts(answers, speedMin);

    const drillAward = incrementalPoints(counts.correct * correctPts, await alreadyAwarded(tx, userId, 'DRILL', set.id, attempt.id));
    const speedAward = incrementalPoints(counts.speed * speedBonus, await alreadyAwarded(tx, userId, 'SPEED_STREAK', set.id, attempt.id));
    const crownAward = crown.changed ? Math.max(0, crownValue(crown.current, { silver: crownSilver, gold: crownGold }) - crownValue(crown.previous, { silver: crownSilver, gold: crownGold })) : 0;

    const drillPts = (await insertLedger(tx, { userId, source: 'DRILL', sourceId: attempt.id, points: drillAward, note: `Latihan ${code}: ${counts.correct} benar` })) ? drillAward : 0;
    const speedPts = (await insertLedger(tx, { userId, source: 'SPEED_STREAK', sourceId: attempt.id, points: speedAward, note: `Speed streak ${counts.speed}x` })) ? speedAward : 0;
    const crownPts = (await insertLedger(tx, { userId, source: 'CROWN', sourceId: attempt.id, points: crownAward, note: `Mahkota ${crown.current === 'GOLD' ? 'Emas' : 'Perak'} ${code}` })) ? crownAward : 0;

    const awarded = drillPts + speedPts + crownPts;
    await addTotal(tx, userId, awarded);
    const best = Math.max(stats.bestSpeedStreak, counts.bestStreak);
    await tx.execute(sql`
      UPDATE user_stats SET best_speed_streak = ${best}, updated_at = now() WHERE user_id = ${userId}::uuid`);
    if (crown.changed) {
      await tx.execute(sql`
        UPDATE user_stats SET
          gold_crowns = (SELECT count(*) FROM user_sub_module_progress WHERE user_id = ${userId}::uuid AND mastery_crown = 'GOLD'),
          silver_crowns = (SELECT count(*) FROM user_sub_module_progress WHERE user_id = ${userId}::uuid AND mastery_crown = 'SILVER'),
          updated_at = now()
        WHERE user_id = ${userId}::uuid`);
    }

    const act = await recordActivityLocked(tx, userId, now, stats);
    await persistBlock(tx, ctx, {
      pointsAwarded: awarded,
      block: {
        points: { drill: drillPts, speed_streak: speedPts, crown: crownPts, boss: 0, daily: act.dailyPoints, total: awarded + act.dailyPoints },
        crown: { previous: crown.previous, current: crown.current, changed: crown.changed },
        best_speed_streak: best,
        daily_streak_days: act.dailyStreakDays,
      },
      progressCrown: crown.current,
    });
    return;
  }

  if (type === 'TIER_BOSS_EXAM') {
    const bossPts = await getSetting<number>(tx, 'points.boss_pass');
    const stats = await lockStats(tx, userId);
    let boss = 0;
    // G5: sekali per set Boss (Tier) -- baris ledger lulus sebelumnya pada set yang sama menutup klaim ulang.
    if (attempt.passed === true && (await alreadyAwarded(tx, userId, 'BOSS', set.id, attempt.id)) === 0) {
      const tier = (result.detail as { tierNumber?: number } | undefined)?.tierNumber;
      if (await insertLedger(tx, { userId, source: 'BOSS', sourceId: attempt.id, points: bossPts, note: tier ? `Boss Stage Tier ${tier} lulus` : 'Boss Stage lulus' })) {
        boss = bossPts;
        await addTotal(tx, userId, boss);
      }
    }
    const act = await recordActivityLocked(tx, userId, now, stats);
    await persistBlock(tx, ctx, {
      pointsAwarded: 0,
      block: {
        points: { ...emptyPoints(), boss, daily: act.dailyPoints, total: boss + act.dailyPoints },
        crown: null,
        best_speed_streak: stats.bestSpeedStreak,
        daily_streak_days: act.dailyStreakDays,
      },
    });
    return;
  }

  // Skip Test: tanpa poin (hanya aktivitas harian, G7). Placement/BOSS_SECTION: tidak dicatat sebagai aktivitas.
  if (type === 'SKIP_MODULE_TEST' || type === 'SKIP_TIER_TEST') await recordActivity(tx, userId, now);
}

async function persistBlock(
  tx: Tx,
  ctx: AttemptCompletedContext,
  p: { pointsAwarded: number; block: GamificationBlock; progressCrown?: CrownLevel },
): Promise<void> {
  const stored = (ctx.attempt.resultJson ?? {}) as Record<string, unknown> & { progress?: Record<string, unknown> | null };
  const next: Record<string, unknown> = { ...stored, gamification: p.block };
  if (p.progressCrown && stored.progress && typeof stored.progress === 'object') next.progress = { ...stored.progress, mastery_crown: p.progressCrown };
  await tx.execute(sql`
    UPDATE attempts SET points_awarded = ${p.pointsAwarded}, result_json = ${JSON.stringify(next)}::jsonb
    WHERE id = ${ctx.attempt.id}::uuid`);
}

// ------------------------------------------------------------------ pembacaan
export async function getStats(db: DbOrTx, userId: string, now: Date = nowDate()): Promise<StatsDTOType> {
  const [s] = await db.select().from(userStats).where(eq(userStats.userId, userId)).limit(1);
  if (!s) {
    return { total_points: 0, daily_streak_days: 0, longest_daily_streak: 0, best_speed_streak: 0, gold_crowns: 0, silver_crowns: 0, last_active_date: null, streak_at_risk: false };
  }
  const v = streakView({ dailyStreakDays: s.dailyStreakDays, longestDailyStreak: s.longestDailyStreak, lastActive: s.lastActiveDate }, now, appTimezone());
  return {
    total_points: s.totalPoints,
    daily_streak_days: v.dailyStreakDays,
    longest_daily_streak: s.longestDailyStreak,
    best_speed_streak: s.bestSpeedStreak,
    gold_crowns: s.goldCrowns,
    silver_crowns: s.silverCrowns,
    last_active_date: v.lastActiveDate,
    streak_at_risk: v.atRisk,
  };
}

export async function listPoints(db: Db, userId: string, page: number, pageSize: number) {
  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(pointLedger)
    .where(and(eq(pointLedger.userId, userId), ne(pointLedger.source, 'ADJUSTMENT')))) as [{ total: number }];
  const rows = await db
    .select()
    .from(pointLedger)
    .where(and(eq(pointLedger.userId, userId), ne(pointLedger.source, 'ADJUSTMENT'))) // F-16-04: ADJUSTMENT tidak ada di kontrak FE
    .orderBy(desc(pointLedger.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    data: rows.map((r) => ({
      id: r.id,
      source: r.source as Exclude<typeof r.source, 'ADJUSTMENT'>,
      points: r.points,
      note: r.note,
      source_id: r.sourceId,
      created_at: r.createdAt.toISOString(),
    })),
    meta: { page, page_size: pageSize, total: Number(total) },
  };
}

export const GamificationService = { recordActivity, gamificationHook, activityHook, getStats, listPoints, createStatsRow };
