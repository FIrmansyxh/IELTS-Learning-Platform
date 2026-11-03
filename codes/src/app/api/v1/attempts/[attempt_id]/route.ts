import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getAttempt } from '@/server/attempts/service';
import { AttemptIdParamSchema } from '@/server/attempts/schemas';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user', params: AttemptIdParamSchema }, async ({ user, params }) => ({
  data: await getAttempt(getDb(), user!.id, params.attempt_id),
}));
