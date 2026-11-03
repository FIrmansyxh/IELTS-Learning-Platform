import { InviteIdParamSchema } from '@/contracts/admin';
import { withApi } from '@/server/http/withApi';
import { revokeInvite } from '@/server/admin/invites';

export const dynamic = 'force-dynamic';

export const DELETE = withApi({ auth: 'admin', params: InviteIdParamSchema }, async ({ user, params, ipHash }) => {
  await revokeInvite(user!.id, params.invite_id, ipHash);
  return { status: 204 };
});
