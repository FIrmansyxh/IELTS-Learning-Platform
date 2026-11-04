import { z } from 'zod';
import {
  ApplyPlacementResponseSchema,
  PlacementResultSchema,
  PlacementStatusResponseSchema,
  PlacementStatusSchema,
} from '@/contracts/placement';

/**
 * Skema Placement Test (SPEC-015) di sisi klien. Status, hasil, dan apply dipakai dari `src/contracts/placement.ts`
 * (satu berkas dengan server); hanya blok `placement` pada intro ujian yang didefinisikan di sini. Drift TIDAK
 * ditambal di klien: respons yang tidak cocok melempar `RESPONSE_INVALID`.
 */
export { ApplyPlacementResponseSchema, PlacementResultSchema, PlacementStatusResponseSchema, PlacementStatusSchema };
export type PlacementStatus = z.infer<typeof PlacementStatusSchema>;
export type PlacementResult = z.infer<typeof PlacementResultSchema>;
export type TierOption = PlacementResult['tier_options'][number];
export type ApplyPlacementData = z.infer<typeof ApplyPlacementResponseSchema>['data'];

/** Blok `placement` pada GET /exams/{id}/intro. */
export const PlacementIntroSchema = z.object({ adaptive: z.boolean(), question_count: z.number().int() });
