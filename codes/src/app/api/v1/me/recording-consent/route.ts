import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { toUserDTO } from '@/server/auth/guards';
import { giveRecordingConsent } from '@/server/ai/speaking';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'user' }, async ({ user }) => ({
  data: { user: toUserDTO(await giveRecordingConsent(getDb(), user!.id)) },
}));
