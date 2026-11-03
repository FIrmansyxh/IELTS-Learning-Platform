import { UserIdParamSchema } from '@/contracts/admin';
import { withApi } from '@/server/http/withApi';
import { resetPasswordByAdmin } from '@/server/admin/users';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'admin', params: UserIdParamSchema }, async ({ user, params, ipHash }) => {
  const r = await resetPasswordByAdmin(user!.id, params.user_id, ipHash);
  return { data: { temporary_password: r.temporaryPassword } };
});
