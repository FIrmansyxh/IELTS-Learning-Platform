import {
  BandPredictionsQuerySchema,
  type BandPredictionsResponse,
} from '@/contracts/skills';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getBandPredictionsHistory } from '@/server/skills/service';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'user',
    query: BandPredictionsQuerySchema,
  },
  async ({
    user,
    query,
  }): Promise<{
    status: 200;
    data: BandPredictionsResponse['data'];
    meta: BandPredictionsResponse['meta'];
  }> => {
    const result = await getBandPredictionsHistory(getDb(), user!.id, query);
    return {
      status: 200,
      data: result.data,
      meta: result.meta,
    };
  },
);

