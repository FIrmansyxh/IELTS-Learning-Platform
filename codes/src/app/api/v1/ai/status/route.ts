import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { aiStatus } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user' }, async ({ user }) => ({ data: await aiStatus(getDb(), user!.id) }));
