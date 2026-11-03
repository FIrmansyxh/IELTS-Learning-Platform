import { BatchIdParamSchema, ItemListQuerySchema } from '@/contracts/import';
import { withApi } from '@/server/http/withApi';
import { listItems } from '@/server/import/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', params: BatchIdParamSchema, query: ItemListQuerySchema }, async ({ params, query }) => {
  const { rows, total } = await listItems(params.batch_id, query);
  return { data: rows, meta: { page: query.page, page_size: query.page_size, total } };
});
