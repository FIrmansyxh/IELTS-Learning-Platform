import { withApi } from '@/server/http/withApi';
import { logoutUser } from '@/server/auth/service';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'user', allowPasswordChangeRequired: true }, async ({ user, ipHash, clearCookie }) => {
  await logoutUser(user!.id, ipHash);
  clearCookie();
  return { status: 204 };
});
