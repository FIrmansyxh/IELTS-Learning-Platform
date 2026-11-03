import { RegisterRequestSchema } from '@/contracts/auth';
import { withApi } from '@/server/http/withApi';
import { registerUser } from '@/server/auth/service';
import { toUserDTO } from '@/server/auth/guards';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  { auth: 'public', body: RegisterRequestSchema, rateLimit: [{ bucket: 'register_ip', key: 'ip' }] },
  async ({ body, ipHash }) => {
    const user = await registerUser(body, ipHash);
    return { status: 201, data: { user: toUserDTO(user) } };
  },
);
