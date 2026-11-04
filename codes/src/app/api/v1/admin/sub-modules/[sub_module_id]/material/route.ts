import { IdParam, UpdateMaterialRequestSchema } from '@/contracts/curation';
import { getDb } from '@/server/db';
import { updateMaterial } from '@/server/curation/service';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

export const PATCH = withApi({ auth: 'admin', params: IdParam('sub_module_id'), body: UpdateMaterialRequestSchema }, async ({ user, ipHash, params, body }) => ({
  data: await updateMaterial(getDb(), { id: user!.id, ipHash }, params.sub_module_id as string, body),
}));
