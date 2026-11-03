import { AdminCreateUserRequestSchema, AdminUserListQuerySchema } from '@/contracts/admin';
import { withApi } from '@/server/http/withApi';
import { createUserByAdmin, listUsers } from '@/server/admin/users';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', query: AdminUserListQuerySchema }, async ({ query }) => {
  const { rows, total } = await listUsers(query);
  return { data: rows, meta: { page: query.page, page_size: query.page_size, total } };
});

export const POST = withApi({ auth: 'admin', body: AdminCreateUserRequestSchema }, async ({ user, body, ipHash }) => {
  const r = await createUserByAdmin(user!.id, body, ipHash);
  return { status: 201, data: { user: r.user, temporary_password: r.temporaryPassword } };
});
