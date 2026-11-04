import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';
import { MasteryCrownLevel } from './player';

/** Skema Gamifikasi (SPEC-016). Klien tidak pernah mengirim poin/mahkota (semua dihitung server). */
export const PointSource = z.enum(['DRILL', 'SPEED_STREAK', 'CROWN', 'MINI_TASK', 'BOSS', 'DAILY']);

export const StatsDTO = z.object({
  total_points: z.number().int().min(0),
  daily_streak_days: z.number().int().min(0),
  longest_daily_streak: z.number().int().min(0),
  best_speed_streak: z.number().int().min(0),
  gold_crowns: z.number().int().min(0),
  silver_crowns: z.number().int().min(0),
  /** Tanggal lokal `APP_TIMEZONE` (YYYY-MM-DD); null bila belum pernah aktif. */
  last_active_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  streak_at_risk: z.boolean(),
});
export type StatsDTOType = z.infer<typeof StatsDTO>;
export const StatsResponseSchema = z.object({ data: StatsDTO });

export const PointsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20),
});

export const PointEntryDTO = z.object({
  id: z.number().int(),
  source: PointSource,
  points: z.number().int(),
  note: z.string().max(200).nullable(),
  source_id: Uuid.nullable(),
  created_at: IsoDateTime,
});
export const PointsResponseSchema = z.object({
  data: z.array(PointEntryDTO),
  meta: z.object({ page: z.number().int(), page_size: z.number().int(), total: z.number().int() }),
});

/** `AttemptResultDTO.gamification` (null untuk tipe selain ACTIVE_DRILL/TIER_BOSS_EXAM dan sebelum SPEC-016 aktif). */
export const GamificationBlockSchema = z.object({
  points: z.object({
    drill: z.number().int(),
    speed_streak: z.number().int(),
    crown: z.number().int(),
    boss: z.number().int(),
    daily: z.number().int(),
    total: z.number().int(),
  }),
  crown: z.object({ previous: MasteryCrownLevel, current: MasteryCrownLevel, changed: z.boolean() }).nullable(),
  best_speed_streak: z.number().int(),
  daily_streak_days: z.number().int(),
});
export type GamificationBlock = z.infer<typeof GamificationBlockSchema>;
