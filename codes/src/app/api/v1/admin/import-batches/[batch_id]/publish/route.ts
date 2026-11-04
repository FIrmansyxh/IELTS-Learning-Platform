import { BatchIdParamSchema, PublishBatchBodySchema } from '@/contracts/import';
import { withApi } from '@/server/http/withApi';
import { requestPublish } from '@/server/import/service';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'admin', params: BatchIdParamSchema, body: PublishBatchBodySchema }, async ({ user, params, body, ipHash }) => ({
  status: 202,
  data: await requestPublish(user!.id, params.batch_id, body, ipHash),
}));
