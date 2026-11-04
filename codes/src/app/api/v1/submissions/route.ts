import { ListSubmissionsQuerySchema } from '@/contracts/ai';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { listSubmissions } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user', query: ListSubmissionsQuerySchema }, async ({ user, query }) => {
  const { rows, total } = await listSubmissions(getDb(), user!.id, query);
  return { data: rows, meta: { page: query.page, page_size: query.page_size, total } };
});
