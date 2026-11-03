import { UserIdParamSchema } from '@/contracts/admin';
import { withApi } from '@/server/http/withApi';
import { deleteUserByAdmin } from '@/server/admin/users';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'admin', params: UserIdParamSchema }, async ({ user, params, ipHash }) => {
  await deleteUserByAdmin(user!.id, params.user_id, ipHash);
  return { status: 204 };
});
