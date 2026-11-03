import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { submitAttempt } from '@/server/attempts/service';
import { AttemptIdParamSchema } from '@/server/attempts/schemas';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'user', params: AttemptIdParamSchema }, async ({ user, params }) => ({
  data: await submitAttempt(getDb(), user!.id, params.attempt_id),
}));
