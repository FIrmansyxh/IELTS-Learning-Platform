import { BatchIdParamSchema } from '@/contracts/import';
import { withApi } from '@/server/http/withApi';
import { cancelBatch } from '@/server/import/service';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'admin', params: BatchIdParamSchema }, async ({ user, params, ipHash }) => ({
  data: await cancelBatch(user!.id, params.batch_id, ipHash),
}));
