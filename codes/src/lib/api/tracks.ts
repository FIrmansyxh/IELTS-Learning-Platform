import { z } from 'zod';
import {
  CurriculumTreeResponseSchema,
  type CurriculumTree,
  type TrackItem,
  type TrackView,
} from '@/contracts/curriculum';
import { SubModuleDetailDTO } from '@/contracts/player';
import { ResumeCardDTO } from '@/contracts/resume';
import {
  TracksResponseSchema,
  TrackSummaryDTO,
  type TrackSummary,
  DeliveryStyleSchema,
  type DeliveryStyle,
  DeliveryDTO,
  type Delivery,
  CheckpointInfoDTO,
  type CheckpointInfo,
  CheckpointStatusSchema,
  type CheckpointStatus,
  CheckpointAttemptResponseSchema,
  TRACK_CODE_RE,
} from '@/contracts/tracks';
import { apiFetch } from './client';

export {
  DeliveryStyleSchema,
  type DeliveryStyle,
  TracksResponseSchema,
  TrackSummaryDTO,
  type TrackSummary,
  CheckpointStatusSchema,
  type CheckpointStatus,
  CheckpointInfoDTO,
  type CheckpointInfo,
  DeliveryDTO,
  type Delivery,
  TRACK_CODE_RE,
  type TrackItem,
  type TrackView,
};

export const DELIVERY_STYLES = ['LEARN_FIRST', 'PRACTICE_FIRST', 'CASE_BASED'] as const;
export type DeliveryStyleValue = DeliveryStyle;
export type CheckpointStatusValue = CheckpointStatus;

export const TrackTreeResponseSchema = CurriculumTreeResponseSchema;
export type TrackTree = CurriculumTree;

export const SubModuleDetailWithDeliverySchema = SubModuleDetailDTO.extend({ delivery: DeliveryDTO.nullish() });
export const SubModuleDetailWithDeliveryResponseSchema = z.object({ data: SubModuleDetailWithDeliverySchema });
export type SubModuleDetailWithDelivery = z.infer<typeof SubModuleDetailWithDeliverySchema>;

export const ResumeCardWithTrackSchema = ResumeCardDTO.extend({
  active_track: z.object({ code: z.string(), title: z.string() }).nullish(),
});
export const ResumeCardWithTrackResponseSchema = z.object({ data: ResumeCardWithTrackSchema.nullable() });
export type ResumeCardWithTrack = z.infer<typeof ResumeCardWithTrackSchema>;

export const StartCheckpointResponseSchema = CheckpointAttemptResponseSchema;

export const CURRICULUM_TRACK_CODE = 'GT-STRUCT';

/** Kode jalur dari URL tidak tepercaya: hanya yang sesuai pola yang dipakai. */
export function parseTrackParam(v: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(v) ? v[0] : v;
  return raw && raw.length >= 4 && raw.length <= 30 && TRACK_CODE_RE.test(raw) ? raw : null;
}

export const tracksApi = {
  list: async (signal?: AbortSignal) => (await apiFetch('/tracks', { schema: TracksResponseSchema, signal })).data,

  /** 204. Idempoten. */
  setActive: async (trackCode: string) => {
    await apiFetch('/me/active-track', { method: 'PUT', body: { track_code: trackCode } });
  },

  tree: async (track: string | null = null, signal?: AbortSignal) =>
    (await apiFetch('/curriculum/tree', { query: track ? { track } : undefined, schema: TrackTreeResponseSchema, signal })).data,

  /** 204. `null` menghapus override gaya profil. */
  setStyle: async (subModuleCode: string, style: DeliveryStyleValue | null) => {
    await apiFetch(`/sub-modules/${encodeURIComponent(subModuleCode)}/style`, { method: 'PUT', body: { style } });
  },

  startCheckpoint: async (trackCode: string, itemId: string) =>
    (
      await apiFetch(`/tracks/${encodeURIComponent(trackCode)}/checkpoints/${itemId}/attempts`, {
        method: 'POST',
        body: {},
        schema: StartCheckpointResponseSchema,
      })
    ).data,
};
