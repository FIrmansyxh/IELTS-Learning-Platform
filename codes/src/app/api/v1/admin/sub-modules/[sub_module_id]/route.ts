import { IdParam, UpdateSubModuleRequestSchema } from '@/contracts/curation';
import { getDb } from '@/server/db';
import { getSubModuleDetail, updateSubModule } from '@/server/curation/service';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

const Params = IdParam('sub_module_id');

export const GET = withApi({ auth: 'admin', params: Params }, async ({ params }) => ({ data: await getSubModuleDetail(getDb(), params.sub_module_id as string) }));

export const PATCH = withApi({ auth: 'admin', params: Params, body: UpdateSubModuleRequestSchema }, async ({ user, ipHash, params, body }) => ({
  data: await updateSubModule(getDb(), { id: user!.id, ipHash }, params.sub_module_id as string, body),
}));
