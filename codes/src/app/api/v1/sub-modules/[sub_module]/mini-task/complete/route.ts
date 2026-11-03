import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { completeMiniTask } from '@/server/player/service';
import { SubModuleIdParamSchema } from '@/server/player/schemas';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'user', params: SubModuleIdParamSchema }, async ({ user, params }) => ({
  data: await getDb().transaction((tx) => completeMiniTask(tx, user!.id, params.sub_module)),
}));
