import { PointsQuerySchema } from '@/contracts/gamification';
import { getDb } from '@/server/db';
import { listPoints } from '@/server/gamification/service';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user', query: PointsQuerySchema }, async ({ user, query }) => {
  const r = await listPoints(getDb(), user!.id, query.page, query.page_size);
  return { data: r.data, meta: r.meta };
});
