import { getDb } from '@/server/db';
import { getStats } from '@/server/gamification/service';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user' }, async ({ user }) => ({ data: await getStats(getDb(), user!.id) }));
