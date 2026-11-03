import { BatchIdParamSchema } from '@/contracts/import';
import { withApi } from '@/server/http/withApi';
import { getBatch } from '@/server/import/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', params: BatchIdParamSchema }, async ({ params }) => ({ data: await getBatch(params.batch_id) }));
