import { apiFetch } from './client';
import { ApplyPlacementResponseSchema, PlacementStatusResponseSchema } from './placement-contract';

export const placementApi = {
  status: async (signal?: AbortSignal) =>
    (await apiFetch('/placement', { schema: PlacementStatusResponseSchema, signal })).data,

  /** Hanya `attempt_id` dan `tier_number`; kelayakan Tier diputuskan server. */
  apply: async (body: { attempt_id: string; tier_number: number }) =>
    (await apiFetch('/placement/apply', { method: 'POST', body, schema: ApplyPlacementResponseSchema })).data,
};
