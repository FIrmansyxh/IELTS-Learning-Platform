import { LearnProgressRequestSchema } from '@/contracts/player';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { recordLearnProgress } from '@/server/player/service';
import { SubModuleIdParamSchema } from '@/server/player/schemas';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  {
    auth: 'user',
    params: SubModuleIdParamSchema,
    body: LearnProgressRequestSchema,
    rateLimit: [{ bucket: 'heartbeat', key: (c) => `${c.user!.id}:learn-progress` }],
  },
  async ({ user, params, body }) => ({
    data: await getDb().transaction((tx) => recordLearnProgress(tx, user!.id, params.sub_module, body)),
  }),
);
