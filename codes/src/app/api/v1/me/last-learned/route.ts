import { UpdateLastLearnedRequestSchema } from '@/contracts/resume';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getResumeCard, updateLastLearned } from '@/server/resume/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user' }, async ({ user }) => ({ data: await getResumeCard(getDb(), user!.id) }));

export const PUT = withApi(
  {
    auth: 'user',
    body: UpdateLastLearnedRequestSchema,
    rateLimit: [{ bucket: 'heartbeat', key: (c) => `${c.user!.id}:last-learned` }],
  },
  async ({ user, body }) => ({ data: await updateLastLearned(getDb(), user!.id, body) }),
);
