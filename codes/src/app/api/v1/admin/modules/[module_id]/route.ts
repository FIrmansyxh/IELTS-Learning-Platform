import { IdParam, UpdateModuleRequestSchema } from '@/contracts/curation';
import { getDb } from '@/server/db';
import { updateModule } from '@/server/curation/service';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

export const PATCH = withApi({ auth: 'admin', params: IdParam('module_id'), body: UpdateModuleRequestSchema }, async ({ user, ipHash, params, body }) => ({
  data: await updateModule(getDb(), { id: user!.id, ipHash }, params.module_id as string, body),
}));
