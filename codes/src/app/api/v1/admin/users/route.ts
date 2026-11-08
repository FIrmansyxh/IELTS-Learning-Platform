import { AdminUserListQuerySchema } from '@/contracts/admin';
import { withApi } from '@/server/http/withApi';
import { listUsers } from '@/server/admin/users';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', query: AdminUserListQuerySchema }, async ({ query }) => {
  const { rows, total } = await listUsers(query);
  return { data: rows, meta: { page: query.page, page_size: query.page_size, total } };
});
