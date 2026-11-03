import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getSubModuleDetail } from '@/server/player/service';
import { SubModuleCodeParamSchema } from '@/server/player/schemas';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user', params: SubModuleCodeParamSchema }, async ({ user, params }) => ({
  data: await getDb().transaction((tx) => getSubModuleDetail(tx, user!.id, params.sub_module)),
}));
