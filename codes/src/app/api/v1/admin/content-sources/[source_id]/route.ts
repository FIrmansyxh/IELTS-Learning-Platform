import { SourceIdParamSchema, UpdateSourceBodySchema } from '@/contracts/assets';
import { withApi } from '@/server/http/withApi';
import { updateSource } from '@/server/assets/registry';

export const dynamic = 'force-dynamic';

export const PATCH = withApi({ auth: 'admin', params: SourceIdParamSchema, body: UpdateSourceBodySchema }, async ({ user, params, body, ipHash }) => ({
  data: await updateSource(user!.id, params.source_id, body, ipHash),
}));
