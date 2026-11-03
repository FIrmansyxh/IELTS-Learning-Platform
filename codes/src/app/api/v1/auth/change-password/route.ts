import { ChangePasswordRequestSchema } from '@/contracts/auth';
import { withApi } from '@/server/http/withApi';
import { changePassword } from '@/server/auth/service';
import { toUserDTO } from '@/server/auth/guards';
import { buildSetCookie, issueSessionToken } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  {
    auth: 'user',
    allowPasswordChangeRequired: true,
    body: ChangePasswordRequestSchema,
    rateLimit: [{ bucket: 'account_action', key: 'user' }],
  },
  async ({ user, body, ipHash, setCookie }) => {
    const updated = await changePassword(user!.id, body, ipHash);
    const t = await issueSessionToken({ id: updated.id, role: updated.role, tokenVersion: updated.tokenVersion });
    setCookie(buildSetCookie(t.value, t.maxAge));
    return { data: { user: toUserDTO(updated) } };
  },
);
