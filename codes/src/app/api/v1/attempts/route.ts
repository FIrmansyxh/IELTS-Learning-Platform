import { StartAttemptRequestSchema } from '@/contracts/attempts';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { startAttempt } from '@/server/attempts/service';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  { auth: 'user', body: StartAttemptRequestSchema, rateLimit: [{ bucket: 'attempt_start', key: 'user' }] },
  async ({ user, body }) => {
    const r = await startAttempt(getDb(), user!.id, body.assessment_set_id);
    return { status: r.created ? 201 : 200, data: r.attempt };
  },
);
