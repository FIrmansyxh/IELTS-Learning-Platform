import { z } from 'zod';
import { Band, Uuid } from './common';

/**
 * Kontrak Jalur Belajar (SPEC-021). Dipakai server dan klien.
 *
 * Berkas ini TIDAK mengimpor `curriculum.ts` (agar tidak melingkar). Bentuk `data.track` pada
 * `GET /curriculum/tree` (`TrackViewDTO`) berada di `curriculum.ts` karena memuat `SubModuleNodeDTO`.
 * Endpoint: `GET /tracks`, `PUT /me/active-track`, `PUT /sub-modules/{code}/style`,
 * `POST /tracks/{track_code}/checkpoints/{item_id}/attempts`; tambahan aditif: `delivery` pada
 * `GET /sub-modules/{code}` dan `active_track` pada `GET /me/last-learned`.
 */
// eslint-disable-next-line security/detect-unsafe-regex
export const TRACK_CODE_RE = /^GT-[A-Z0-9]+(-[A-Z0-9]+)*$/;
export const TRACK_CODE_MIN = 4;
export const TRACK_CODE_MAX = 30;
export const CHECKPOINT_PASS_PERCENT = 75;
export const CHECKPOINT_QUESTION_COUNT = 10;
export const CHECKPOINT_MIN_POOL = 5;

export const TrackCodeSchema = z
  .string()
  .min(TRACK_CODE_MIN, { error: 'invalid_format' })
  .max(TRACK_CODE_MAX, { error: 'invalid_format' })
  .regex(TRACK_CODE_RE, { error: 'invalid_format' });

export const DeliveryStyleSchema = z.enum(['LEARN_FIRST', 'PRACTICE_FIRST', 'CASE_BASED']);
export type DeliveryStyle = z.infer<typeof DeliveryStyleSchema>;
/** Gaya yang boleh memiliki varian materi (LEARN_FIRST = materi bawaan `BASE`). */
export const VariantStyleSchema = z.enum(['PRACTICE_FIRST', 'CASE_BASED']);
export type VariantStyle = z.infer<typeof VariantStyleSchema>;
export const DeliverySourceSchema = z.enum(['QUERY', 'USER_OVERRIDE', 'TRACK_DEFAULT']);
export type DeliverySource = z.infer<typeof DeliverySourceSchema>;
export const TrackKindSchema = z.enum(['CURRICULUM', 'CURATED']);
export const TrackLayoutSchema = z.enum(['LIST', 'SPRINT']);
export const TrackItemKindSchema = z.enum(['SUB_MODULE', 'CHECKPOINT']);
export const CheckpointStatusSchema = z.enum(['NOT_READY', 'READY', 'ATTEMPTED', 'PASSED']);
export type CheckpointStatus = z.infer<typeof CheckpointStatusSchema>;

// ---------------------------------------------------------------- GET /api/v1/tracks
export const TrackSummaryDTO = z.object({
  code: z.string(),
  title: z.string(),
  description: z.string(),
  kind: TrackKindSchema,
  layout: TrackLayoutSchema,
  delivery_style_default: DeliveryStyleSchema,
  target_band_min: Band,
  target_band_max: Band,
  recommended_for: z.string(),
  total_sub_modules: z.number().int(),
  completed_sub_modules: z.number().int(),
  checkpoint_count: z.number().int(),
  is_active: z.boolean(),
});
export type TrackSummary = z.infer<typeof TrackSummaryDTO>;
export const TracksResponseSchema = z.object({ data: z.array(TrackSummaryDTO) });

// ---------------------------------------------------------------- PUT /api/v1/me/active-track (204)
export const ActiveTrackRequestSchema = z.strictObject({ track_code: TrackCodeSchema });
export type ActiveTrackRequest = z.infer<typeof ActiveTrackRequestSchema>;

// ---------------------------------------------------------------- GET /api/v1/curriculum/tree?track=
export const TrackTreeQuerySchema = z.strictObject({ track: TrackCodeSchema.optional() });

export const CheckpointInfoDTO = z.object({
  status: CheckpointStatusSchema,
  best_percent: z.number().nullable(),
  covers: z.array(z.string()),
  pool_size: z.number().int(),
  pass_percent: z.literal(CHECKPOINT_PASS_PERCENT),
});
export type CheckpointInfo = z.infer<typeof CheckpointInfoDTO>;

// ---------------------------------------------------------------- GET /api/v1/sub-modules/{code}?style=
export const SubModuleDetailQuerySchema = z.strictObject({ style: DeliveryStyleSchema.optional() });

export const DeliveryDTO = z.object({
  requested_style: DeliveryStyleSchema,
  applied_style: DeliveryStyleSchema,
  source: DeliverySourceSchema,
  /** Selalu memuat `LEARN_FIRST`; ditambah gaya yang punya varian pada sub-modul itu. */
  available_styles: z.array(DeliveryStyleSchema),
});
export type Delivery = z.infer<typeof DeliveryDTO>;

// ---------------------------------------------------------------- PUT /api/v1/sub-modules/{code}/style (204)
export const SubModuleStyleRequestSchema = z.strictObject({ style: DeliveryStyleSchema.nullable() });
export type SubModuleStyleRequest = z.infer<typeof SubModuleStyleRequestSchema>;

// ---------------------------------------------------------------- POST /api/v1/tracks/{track_code}/checkpoints/{item_id}/attempts (201)
export const CheckpointAttemptRequestSchema = z.strictObject({});
export const CheckpointParamsSchema = z.strictObject({ track_code: TrackCodeSchema, item_id: Uuid });
export const CheckpointAttemptSchema = z.object({
  attempt_id: Uuid,
  question_count: z.number().int(),
  pass_percent: z.literal(CHECKPOINT_PASS_PERCENT),
  covers: z.array(z.string()),
});
export type CheckpointAttempt = z.infer<typeof CheckpointAttemptSchema>;
export const CheckpointAttemptResponseSchema = z.object({ data: CheckpointAttemptSchema });

// ---------------------------------------------------------------- GET /api/v1/me/last-learned (aditif)
export const ActiveTrackRefDTO = z.object({ code: z.string(), title: z.string() });
export type ActiveTrackRef = z.infer<typeof ActiveTrackRefDTO>;

// ---------------------------------------------------------------- `attempts.state` TRACK_CHECKPOINT (SERVER SAJA)
export const CHECKPOINT_STATE_SCHEMA = 'checkpoint.v1' as const;
export interface CheckpointStateQuestion {
  position: number;
  question_id: string;
  /** `assessment_sets.id` drill asal (= `attempt_answers.assessment_set_id`). */
  set_id: string;
  sub_module_code: string;
  skill: string;
  question_type: string;
  /** ID opaque opsi sesuai urutan tersaji; null bila tidak diacak. */
  option_order: string[] | null;
  /** Objek Question lengkap termasuk kunci jawaban. */
  question: unknown;
}
export interface CheckpointState {
  schema: typeof CHECKPOINT_STATE_SCHEMA;
  track_item_id: string;
  rng_seed: string;
  questions: CheckpointStateQuestion[];
}
