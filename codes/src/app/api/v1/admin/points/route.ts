import { withApi } from '@/server/http/withApi';
import { getDb } from '@/server/db';
import { adminListUserPoints } from '@/server/gamification/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin' }, async () => {
  const db = getDb();
  const result = await adminListUserPoints(db);
  return { data: result };
});
