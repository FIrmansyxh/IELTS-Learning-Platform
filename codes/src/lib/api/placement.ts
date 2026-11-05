import {
  PlacementStatusResponseSchema,
  ApplyPlacementResponseSchema,
} from '@/contracts/placement';
import { apiFetch } from './client';

export const placementApi = {
  status: async (signal?: AbortSignal) =>
    (await apiFetch('/placement', { schema: PlacementStatusResponseSchema, signal })).data,

  apply: async (attemptId: string, tierNumber: number) =>
    (
      await apiFetch('/placement/apply', {
        method: 'POST',
        body: { attempt_id: attemptId, tier_number: tierNumber },
        schema: ApplyPlacementResponseSchema,
      })
    ).data,
};

