import { and, desc, eq, sql } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../db';
import {
  attempts,
  attemptAnswers,
  pointLedger,
  userStats,
} from '@/db/schema';
import {
  getCrownCounts,
  getSubModuleCrown,
  updateSubModuleCrown,
} from '../gatekeeping/service';
import type { AttemptCompletedContext } from '../attempts/hooks';
import type {
  AttemptGamificationDTO,
  MasteryCrownType,
  PointLedgerItemDTO,
  PointsHistoryQuery,
  PointsHistoryResponse,
  StatsDTO,
} from '@/contracts/gamification';
import { getSetting } from '../settings/service';
import { STATE_ONLY_TYPES } from '../mix/state';

const CROWN_RANK: Record<MasteryCrownType, number> = {
  NONE: 0,
  SILVER: 1,
  GOLD: 2,
};

async function getNumSetting(tx: DbOrTx, key: string, fallback: number): Promise<number> {
  const v = await getSetting(tx, key);
  return typeof v === 'number' ? v : (v !== undefined ? Number(v) : fallback);
}

/** Zona waktu batas hari (streak/poin harian). Variabel lingkungan (SPEC-000), bukan pengaturan database. */
function appTimezone(): string {
  return process.env.APP_TIMEZONE || 'Asia/Jakarta';
}

/** Format Date ke tanggal kalender YYYY-MM-DD pada zona waktu tertentu. */
export function formatDateInTz(d: Date, timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(d);
  } catch {
    // Fallback jika timezone tidak valid
    return d.toISOString().slice(0, 10);
  }
}

/** Hitung tanggal kemarin (1 hari kalender sebelumnya) dari string YYYY-MM-DD. */
export function getYesterdayDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** Pastikan baris user_stats ada secara idempoten. */
export async function ensureUserStats(tx: DbOrTx, userId: string): Promise<void> {
  await tx.insert(userStats).values({ userId }).onConflictDoNothing();
}

/** Ambil statistik gamifikasi pengguna (SPEC-016 GET /me/stats). */
export async function getUserStats(tx: DbOrTx, userId: string, now = new Date()): Promise<StatsDTO> {
  const [row] = await tx.select().from(userStats).where(eq(userStats.userId, userId)).limit(1);

  if (!row) {
    return {
      total_points: 0,
      daily_streak_days: 0,
      longest_daily_streak: 0,
      best_speed_streak: 0,
      gold_crowns: 0,
      silver_crowns: 0,
      last_active_date: null,
      streak_at_risk: false,
    };
  }

  const tz = appTimezone();
  const today = formatDateInTz(now, tz);
  const yesterday = getYesterdayDateStr(today);

  let daily_streak_days = row.dailyStreakDays;
  let streak_at_risk = false;
  let last_active_date: string | null = null;

  if (row.lastActiveDate) {
    last_active_date = formatDateInTz(row.lastActiveDate, tz);
    if (last_active_date === today) {
      daily_streak_days = row.dailyStreakDays;
      streak_at_risk = false;
    } else if (last_active_date === yesterday) {
      daily_streak_days = row.dailyStreakDays;
      streak_at_risk = true;
    } else {
      // Streak patah
      daily_streak_days = 0;
      streak_at_risk = false;
    }
  } else {
    daily_streak_days = 0;
    streak_at_risk = false;
  }

  return {
    total_points: row.totalPoints,
    daily_streak_days,
    longest_daily_streak: row.longestDailyStreak,
    best_speed_streak: row.bestSpeedStreak,
    gold_crowns: row.goldCrowns,
    silver_crowns: row.silverCrowns,
    last_active_date,
    streak_at_risk,
  };
}

/** Ambil riwayat ledger poin pengguna (SPEC-016 GET /me/points). */
export async function getPointsHistory(
  tx: DbOrTx,
  userId: string,
  query: PointsHistoryQuery,
): Promise<PointsHistoryResponse> {
  const { page, page_size } = query;
  const offset = (page - 1) * page_size;

  const rows = await tx
    .select()
    .from(pointLedger)
    .where(eq(pointLedger.userId, userId))
    .orderBy(desc(pointLedger.id))
    .limit(page_size)
    .offset(offset);

  const [countRow] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(pointLedger)
    .where(eq(pointLedger.userId, userId));

  const total = countRow?.count ?? 0;

  const data: PointLedgerItemDTO[] = rows.map((r) => ({
    id: r.id,
    source: r.source,
    points: r.points,
    note: r.note,
    source_id: r.sourceId,
    created_at: r.createdAt.toISOString(),
  }));

  return {
    data,
    meta: {
      page,
      page_size,
      total,
    },
  };
}

/** Catat aktivitas harian dan perbarui streak (G7). */
export async function recordActivity(
  tx: Tx,
  userId: string,
  now = new Date(),
): Promise<{ daily_points_awarded: number; daily_streak_days: number }> {
  await ensureUserStats(tx, userId);

  // Kunci baris user_stats untuk pembaruan
  const [row] = await tx
    .select()
    .from(userStats)
    .where(eq(userStats.userId, userId));

  if (!row) {
    return { daily_points_awarded: 0, daily_streak_days: 0 };
  }

  const tz = appTimezone();
  const dailyPointsSetting = await getNumSetting(tx, 'points.daily_activity', 5);

  const today = formatDateInTz(now, tz);
  const yesterday = getYesterdayDateStr(today);
  const last = row.lastActiveDate ? formatDateInTz(row.lastActiveDate, tz) : null;

  if (last === today) {
    // Sudah aktif hari ini: tidak ada perubahan streak maupun poin
    return { daily_points_awarded: 0, daily_streak_days: row.dailyStreakDays };
  }

  let newStreak = 1;
  if (last === yesterday) {
    newStreak = row.dailyStreakDays + 1;
  }

  const longest = Math.max(row.longestDailyStreak, newStreak);
  const dailyPoints = dailyPointsSetting > 0 ? dailyPointsSetting : 0;

  if (dailyPoints > 0) {
    await tx.insert(pointLedger).values({
      userId,
      source: 'DAILY',
      sourceId: null,
      points: dailyPoints,
      note: 'Aktivitas harian',
      createdAt: now,
    });
  }

  await tx
    .update(userStats)
    .set({
      dailyStreakDays: newStreak,
      longestDailyStreak: longest,
      lastActiveDate: now,
      totalPoints: row.totalPoints + dailyPoints,
      updatedAt: now,
    })
    .where(eq(userStats.userId, userId));

  return { daily_points_awarded: dailyPoints, daily_streak_days: newStreak };
}

/** Tangani gamifikasi Mini-Task (G6). */
export async function handleMiniTaskGamification(
  tx: Tx,
  userId: string,
  subModuleId: string,
  now = new Date(),
): Promise<void> {
  // Cek apakah poin mini-task sudah pernah diberikan
  const [existing] = await tx
    .select({ id: pointLedger.id })
    .from(pointLedger)
    .where(
      and(
        eq(pointLedger.userId, userId),
        eq(pointLedger.source, 'MINI_TASK'),
        eq(pointLedger.sourceId, subModuleId),
      ),
    )
    .limit(1);

  let pointsEarned = 0;
  if (!existing) {
    const miniTaskPoints = await getNumSetting(tx, 'points.mini_task', 20);
    if (miniTaskPoints > 0) {
      await tx.insert(pointLedger).values({
        userId,
        source: 'MINI_TASK',
        sourceId: subModuleId,
        points: miniTaskPoints,
        note: 'Penyelesaian Mini-Task',
        createdAt: now,
      });
      pointsEarned = miniTaskPoints;
    }
  }

  const { daily_points_awarded } = await recordActivity(tx, userId, now);

  if (pointsEarned > 0 || daily_points_awarded > 0) {
    await tx
      .update(userStats)
      .set({
        totalPoints: sql`${userStats.totalPoints} + ${pointsEarned}`,
        updatedAt: now,
      })
      .where(eq(userStats.userId, userId));
  }
}

/** Hook Attempt Selesai: menghitung poin, mahkota, speed streak, dan streak harian (SPEC-016). */
export async function gamificationHook(ctx: AttemptCompletedContext): Promise<void> {
  const { tx, userId, set } = ctx;
  const now = new Date();

  // SPEC-022 (+ 021/023): attempt berbasis state tidak memberi poin, mahkota, speed streak, maupun streak harian.
  if (STATE_ONLY_TYPES.has(ctx.attempt.assessmentType)) return;

  if (set.assessmentType === 'ACTIVE_DRILL') {
    await handleDrillGamification(ctx, now);
  } else if (set.assessmentType === 'TIER_BOSS_EXAM') {
    await handleBossGamification(ctx, now);
  } else {
    // Skip test atau tipe lain: hanya catat aktivitas harian (G7)
    await recordActivity(tx, userId, now);
  }
}

async function handleDrillGamification(ctx: AttemptCompletedContext, now: Date): Promise<void> {
  const { tx, userId, attempt, set, result } = ctx;

  const correctSetting = await getNumSetting(tx, 'points.correct_answer', 10);
  const speedMinSetting = await getNumSetting(tx, 'points.speed_streak_min', 3);
  const speedBonusSetting = await getNumSetting(tx, 'points.speed_streak_bonus', 5);
  const silverPointsSetting = await getNumSetting(tx, 'points.crown_silver', 50);
  const goldPointsSetting = await getNumSetting(tx, 'points.crown_gold', 100);
  const silverMinPercent = await getNumSetting(tx, 'crown.silver_min', 75);
  const goldMinPercent = await getNumSetting(tx, 'crown.gold_min', 90);

  // 1. Ambil jawaban attempt untuk menghitung correct_count dan speed streak
  const answers = await tx
    .select({
      isCorrect: attemptAnswers.isCorrect,
      speedStreakLen: attemptAnswers.speedStreakLen,
    })
    .from(attemptAnswers)
    .where(eq(attemptAnswers.attemptId, attempt.id));

  const correctCount = answers.filter((a) => a.isCorrect === true).length;
  const speedCount = answers.filter((a) => (a.speedStreakLen ?? 0) >= speedMinSetting).length;
  const maxAttemptSpeedStreak = answers.reduce((m, a) => Math.max(m, a.speedStreakLen ?? 0), 0);

  // G1: Drill points delta (anti-farming)
  const drillPointsTarget = correctCount * correctSetting;
  const [existingDrillRow] = await tx
    .select({ total: sql<number>`coalesce(sum(points), 0)` })
    .from(pointLedger)
    .where(
      and(
        eq(pointLedger.userId, userId),
        eq(pointLedger.source, 'DRILL'),
        sql`${pointLedger.sourceId} IN (
          SELECT id FROM attempts WHERE user_id = ${userId} AND assessment_set_id = ${set.id}
        )`,
      ),
    );
  const existingDrill = existingDrillRow?.total ?? 0;
  const drillDelta = Math.max(0, drillPointsTarget - existingDrill);

  if (drillDelta > 0) {
    await tx.insert(pointLedger).values({
      userId,
      source: 'DRILL',
      sourceId: attempt.id,
      points: drillDelta,
      note: `Latihan: ${correctCount} benar`,
      createdAt: now,
    });
  }

  // G2: Speed streak delta (anti-farming)
  const speedPointsTarget = speedCount * speedBonusSetting;
  const [existingSpeedRow] = await tx
    .select({ total: sql<number>`coalesce(sum(points), 0)` })
    .from(pointLedger)
    .where(
      and(
        eq(pointLedger.userId, userId),
        eq(pointLedger.source, 'SPEED_STREAK'),
        sql`${pointLedger.sourceId} IN (
          SELECT id FROM attempts WHERE user_id = ${userId} AND assessment_set_id = ${set.id}
        )`,
      ),
    );
  const existingSpeed = existingSpeedRow?.total ?? 0;
  const speedDelta = Math.max(0, speedPointsTarget - existingSpeed);

  if (speedDelta > 0) {
    await tx.insert(pointLedger).values({
      userId,
      source: 'SPEED_STREAK',
      sourceId: attempt.id,
      points: speedDelta,
      note: `Speed streak ${speedCount}x`,
      createdAt: now,
    });
  }

  // G4: Mahkota
  let previousCrown: MasteryCrownType = 'NONE';
  let currentCrown: MasteryCrownType = 'NONE';
  let crownChanged = false;
  let crownDelta = 0;

  if (set.subModuleId) {
    previousCrown = (await getSubModuleCrown(tx, userId, set.subModuleId)) as MasteryCrownType;
    currentCrown = previousCrown;

    // Mahkota hanya dievaluasi jika attempt LULUS (passed === true)
    if (result.passed === true) {
      const scorePercent = result.percentH / 100;
      let computedCrown: MasteryCrownType = 'NONE';
      if (scorePercent >= goldMinPercent) {
        computedCrown = 'GOLD';
      } else if (scorePercent >= silverMinPercent) {
        computedCrown = 'SILVER';
      }

      if (CROWN_RANK[computedCrown] > CROWN_RANK[previousCrown]) {
        currentCrown = computedCrown;
        crownChanged = true;

        await updateSubModuleCrown(
          tx,
          userId,
          set.subModuleId,
          currentCrown as 'SILVER' | 'GOLD',
          now,
        );

        const valNew = currentCrown === 'GOLD' ? goldPointsSetting : silverPointsSetting;
        const valOld = previousCrown === 'SILVER' ? silverPointsSetting : 0;
        crownDelta = Math.max(0, valNew - valOld);

        if (crownDelta > 0) {
          await tx.insert(pointLedger).values({
            userId,
            source: 'CROWN',
            sourceId: attempt.id,
            points: crownDelta,
            note: `Mahkota ${currentCrown === 'GOLD' ? 'Emas' : 'Perak'}`,
            createdAt: now,
          });
        }
      }
    }
  }

  // G7: Aktivitas harian
  const { daily_points_awarded, daily_streak_days } = await recordActivity(tx, userId, now);

  // G8: Update attempts.points_awarded (drill + speed + crown)
  const attemptPoints = drillDelta + speedDelta + crownDelta;
  await tx
    .update(attempts)
    .set({ pointsAwarded: attemptPoints, updatedAt: now })
    .where(eq(attempts.id, attempt.id));

  // G8: Update user_stats
  const [statsRow] = await tx
    .select()
    .from(userStats)
    .where(eq(userStats.userId, userId))
    .limit(1);

  const bestSpeed = Math.max(statsRow?.bestSpeedStreak ?? 0, maxAttemptSpeedStreak);

  // Hitung jumlah mahkota emas & perak pengguna
  const crownCount = await getCrownCounts(tx, userId);

  const totalPointsGained = attemptPoints; // daily points sudah ditambahkan di recordActivity
  await tx
    .update(userStats)
    .set({
      totalPoints: sql`${userStats.totalPoints} + ${totalPointsGained}`,
      bestSpeedStreak: bestSpeed,
      goldCrowns: crownCount.gold,
      silverCrowns: crownCount.silver,
      updatedAt: now,
    })
    .where(eq(userStats.userId, userId));

  // Simpan blok gamification pada result_json attempt
  const gamificationDTO: AttemptGamificationDTO = {
    points: {
      drill: drillDelta,
      speed_streak: speedDelta,
      crown: crownDelta,
      boss: 0,
      daily: daily_points_awarded,
      total: drillDelta + speedDelta + crownDelta + daily_points_awarded,
    },
    crown: {
      previous: previousCrown,
      current: currentCrown,
      changed: crownChanged,
    },
    best_speed_streak: bestSpeed,
    daily_streak_days,
  };

  const currentResultJson = (attempt.resultJson as Record<string, unknown>) ?? {};
  await tx
    .update(attempts)
    .set({
      resultJson: {
        ...currentResultJson,
        gamification: gamificationDTO,
      },
      updatedAt: now,
    })
    .where(eq(attempts.id, attempt.id));
}

async function handleBossGamification(ctx: AttemptCompletedContext, now: Date): Promise<void> {
  const { tx, userId, attempt, result } = ctx;

  let bossPointsDelta = 0;
  if (result.passed === true) {
    // Cek apakah ini kelulusan Boss pertama kali
    const [existing] = await tx
      .select({ id: pointLedger.id })
      .from(pointLedger)
      .where(
        and(
          eq(pointLedger.userId, userId),
          eq(pointLedger.source, 'BOSS'),
          eq(pointLedger.sourceId, attempt.id),
        ),
      )
      .limit(1);

    if (!existing) {
      const bossPointsSetting = await getNumSetting(tx, 'points.boss_pass', 200);
      if (bossPointsSetting > 0) {
        await tx.insert(pointLedger).values({
          userId,
          source: 'BOSS',
          sourceId: attempt.id,
          points: bossPointsSetting,
          note: 'Lulus Boss Stage',
          createdAt: now,
        });
        bossPointsDelta = bossPointsSetting;
      }
    }
  }

  const { daily_points_awarded, daily_streak_days } = await recordActivity(tx, userId, now);

  if (bossPointsDelta > 0) {
    await tx
      .update(userStats)
      .set({
        totalPoints: sql`${userStats.totalPoints} + ${bossPointsDelta}`,
        updatedAt: now,
      })
      .where(eq(userStats.userId, userId));
  }

  const [statsRow] = await tx
    .select({ bestSpeedStreak: userStats.bestSpeedStreak })
    .from(userStats)
    .where(eq(userStats.userId, userId))
    .limit(1);

  const gamificationDTO: AttemptGamificationDTO = {
    points: {
      drill: 0,
      speed_streak: 0,
      crown: 0,
      boss: bossPointsDelta,
      daily: daily_points_awarded,
      total: bossPointsDelta + daily_points_awarded,
    },
    crown: null,
    best_speed_streak: statsRow?.bestSpeedStreak ?? 0,
    daily_streak_days,
  };

  const currentResultJson = (attempt.resultJson as Record<string, unknown>) ?? {};
  await tx
    .update(attempts)
    .set({
      resultJson: {
        ...currentResultJson,
        gamification: gamificationDTO,
      },
      updatedAt: now,
    })
    .where(eq(attempts.id, attempt.id));
}

/**
 * Penyesuaian poin manual oleh Admin (reward/koreksi).
 */
export async function adminAdjustUserPoints(
  tx: Tx,
  params: { userId: string; points: number; note: string },
  now = new Date(),
) {
  await ensureUserStats(tx, params.userId);

  const [row] = await tx
    .select()
    .from(userStats)
    .where(eq(userStats.userId, params.userId));

  const currentTotal = row?.totalPoints ?? 0;
  const newTotal = Math.max(0, currentTotal + params.points);

  await tx.insert(pointLedger).values({
    userId: params.userId,
    source: 'ADJUSTMENT',
    sourceId: null,
    points: params.points,
    note: params.note,
    createdAt: now,
  });

  await tx
    .update(userStats)
    .set({
      totalPoints: newTotal,
      updatedAt: now,
    })
    .where(eq(userStats.userId, params.userId));

  return { totalPoints: newTotal };
}
