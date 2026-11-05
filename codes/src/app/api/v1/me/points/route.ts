import { PointsHistoryQuerySchema, type PointsHistoryResponse } from '@/contracts/gamification';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getPointsHistory } from '@/server/gamification/service';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'user',
    query: PointsHistoryQuerySchema,
  },
  async ({ user, query }): Promise<{ status: 200; data: PointsHistoryResponse['data']; meta: PointsHistoryResponse['meta'] }> => {
    const result = await getPointsHistory(getDb(), user!.id, query);
    return {
      status: 200,
      data: result.data,
      meta: result.meta,
    };
  },
);

