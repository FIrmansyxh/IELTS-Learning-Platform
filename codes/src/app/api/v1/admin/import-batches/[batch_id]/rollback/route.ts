import { BatchIdParamSchema } from '@/contracts/import';
import { withApi } from '@/server/http/withApi';
import { rollbackBatch } from '@/server/import/rollback';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'admin', params: BatchIdParamSchema }, async ({ user, params, ipHash }) => ({
  data: await rollbackBatch(user!.id, params.batch_id, ipHash),
}));
