import { LoginRequestSchema } from '@/contracts/auth';
import { withApi } from '@/server/http/withApi';
import { loginUser } from '@/server/auth/service';
import { toUserDTO } from '@/server/auth/guards';
import { buildSetCookie, issueSessionToken } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  {
    auth: 'public',
    body: LoginRequestSchema,
    rateLimit: [
      { bucket: 'login_ip', key: 'ip' },
      { bucket: 'login_email', key: (c) => c.body.email.toLowerCase() },
    ],
  },
  async ({ body, ipHash, setCookie }) => {
    const user = await loginUser(body.email, body.password, ipHash);
    const t = await issueSessionToken({ id: user.id, role: user.role, tokenVersion: user.tokenVersion });
    setCookie(buildSetCookie(t.value, t.maxAge));
    return { data: { user: toUserDTO(user) } };
  },
);
