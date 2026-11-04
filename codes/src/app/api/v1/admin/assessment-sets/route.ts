import { SetListQuerySchema } from '@/contracts/curation';
import { getDb } from '@/server/db';
import { listSets } from '@/server/curation/service';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', query: SetListQuerySchema }, async ({ query }) => {
  const r = await listSets(getDb(), query);
  return { data: r.data, meta: r.meta };
});
