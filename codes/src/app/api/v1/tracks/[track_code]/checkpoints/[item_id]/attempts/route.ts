import { z } from 'zod';
import { TrackCodeSchema } from '@/contracts/tracks';
import { withApi } from '@/server/http/withApi';
import { startCheckpointAttempt } from '@/server/tracks/checkpoint';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.strictObject({
  track_code: TrackCodeSchema,
  item_id: z.string().uuid(),
});

const EmptyBodySchema = z.strictObject({});

/** POST /api/v1/tracks/{track_code}/checkpoints/{item_id}/attempts (SPEC-021). */
export const POST = withApi(
  {
    auth: 'user',
    params: ParamsSchema,
    body: EmptyBodySchema.optional(),
  },
  async ({ user, params }) => {
    const res = await startCheckpointAttempt(user!.id, params.track_code, params.item_id);
    return {
      status: 201,
      data: res,
    };
  },
);
