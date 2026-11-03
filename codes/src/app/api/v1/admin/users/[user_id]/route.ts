import { AdminUpdateUserRequestSchema, UserIdParamSchema } from '@/contracts/admin';
import { withApi } from '@/server/http/withApi';
import { updateUserByAdmin } from '@/server/admin/users';

export const dynamic = 'force-dynamic';

export const PATCH = withApi(
  { auth: 'admin', params: UserIdParamSchema, body: AdminUpdateUserRequestSchema },
  async ({ user, params, body, ipHash }) => ({ data: { user: await updateUserByAdmin(user!.id, params.user_id, body, ipHash) } }),
);
