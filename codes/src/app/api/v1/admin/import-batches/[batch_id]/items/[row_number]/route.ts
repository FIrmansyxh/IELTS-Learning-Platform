import { BatchRowParamSchema } from '@/contracts/import';
import { withApi } from '@/server/http/withApi';
import { getItem } from '@/server/import/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', params: BatchRowParamSchema }, async ({ params }) => ({
  data: await getItem(params.batch_id, params.row_number),
}));
