import { MixRequestSchema } from '@/contracts/mix';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { createMixSession } from '@/server/mix/service';

export const dynamic = 'force-dynamic';

/** POST /api/v1/mix-sessions (SPEC-022): buat attempt MIX_PRACTICE dari filter + mode. */
export const POST = withApi(
  { auth: 'user', body: MixRequestSchema, rateLimit: [{ bucket: 'mix_start', key: 'user' }] },
  async ({ user, body }) => ({ status: 201, data: await createMixSession(getDb(), user!.id, body) }),
);
