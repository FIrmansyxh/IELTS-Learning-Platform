import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { recordConsent } from '@/server/ai/service';
import { toSessionUser, toUserDTO } from '@/server/auth/guards';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  {
    auth: 'user',
  },
  async ({ user }) => {
    const updated = await recordConsent(getDb(), user!.id);
    return {
      status: 200,
      data: {
        user: toUserDTO(toSessionUser(updated)),
      },
    };
  },
);
