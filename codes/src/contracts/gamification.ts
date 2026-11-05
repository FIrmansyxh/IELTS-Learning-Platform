import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';

export const PointSource = z.enum([
  'DRILL',
  'SPEED_STREAK',
  'CROWN',
  'MINI_TASK',
  'BOSS',
  'DAILY',
  'ADJUSTMENT',
]);
export type PointSourceType = z.infer<typeof PointSource>;

export const MasteryCrown = z.enum(['NONE', 'SILVER', 'GOLD']);
export type MasteryCrownType = z.infer<typeof MasteryCrown>;

export const StatsDTOSchema = z.object({
  total_points: z.number().int().nonnegative(),
  daily_streak_days: z.number().int().nonnegative(),
  longest_daily_streak: z.number().int().nonnegative(),
  best_speed_streak: z.number().int().nonnegative(),
  gold_crowns: z.number().int().nonnegative(),
  silver_crowns: z.number().int().nonnegative(),
  last_active_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  streak_at_risk: z.boolean(),
});
export type StatsDTO = z.infer<typeof StatsDTOSchema>;

export const StatsResponseSchema = z.object({
  data: StatsDTOSchema,
});
export type StatsResponse = z.infer<typeof StatsResponseSchema>;

export const PointLedgerItemSchema = z.object({
  id: z.number().int(),
  source: PointSource,
  points: z.number().int(),
  note: z.string().max(200).nullable(),
  source_id: Uuid.nullable(),
  created_at: IsoDateTime,
});
export type PointLedgerItemDTO = z.infer<typeof PointLedgerItemSchema>;

export const PointsHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20),
});
export type PointsHistoryQuery = z.infer<typeof PointsHistoryQuerySchema>;

export const PointsHistoryResponseSchema = z.object({
  data: z.array(PointLedgerItemSchema),
  meta: z.object({
    page: z.number().int(),
    page_size: z.number().int(),
    total: z.number().int(),
  }),
});
export type PointsHistoryResponse = z.infer<typeof PointsHistoryResponseSchema>;

export const AttemptGamificationSchema = z.object({
  points: z.object({
    drill: z.number().int(),
    speed_streak: z.number().int(),
    crown: z.number().int(),
    boss: z.number().int(),
    daily: z.number().int(),
    total: z.number().int(),
  }),
  crown: z
    .object({
      previous: MasteryCrown,
      current: MasteryCrown,
      changed: z.boolean(),
    })
    .nullable(),
  best_speed_streak: z.number().int(),
  daily_streak_days: z.number().int(),
});
export type AttemptGamificationDTO = z.infer<typeof AttemptGamificationSchema>;

