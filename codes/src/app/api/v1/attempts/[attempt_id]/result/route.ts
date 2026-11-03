import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getAttemptResult } from '@/server/attempts/service';
import { AttemptIdParamSchema } from '@/server/attempts/schemas';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user', params: AttemptIdParamSchema }, async ({ user, params }) => ({
  data: await getAttemptResult(getDb(), user!.id, params.attempt_id),
}));
