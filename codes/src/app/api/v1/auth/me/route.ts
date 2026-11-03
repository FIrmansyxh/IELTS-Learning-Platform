import { withApi } from '@/server/http/withApi';
import { toUserDTO } from '@/server/auth/guards';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user', allowPasswordChangeRequired: true }, async ({ user }) => ({
  data: { user: toUserDTO(user!) },
}));
