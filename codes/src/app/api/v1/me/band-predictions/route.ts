import { BandPredictionsQuerySchema } from '@/contracts/skills';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { listBandPredictions } from '@/server/skills/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user', query: BandPredictionsQuerySchema }, async ({ user, query }) => {
  const r = await listBandPredictions(getDb(), user!.id, query.page, query.page_size);
  return { data: r.data, meta: r.meta };
});
