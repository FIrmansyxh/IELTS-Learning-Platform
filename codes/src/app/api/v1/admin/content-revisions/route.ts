import { RevisionListQuerySchema } from '@/contracts/curation';
import { getDb } from '@/server/db';
import { listRevisions } from '@/server/curation/service';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', query: RevisionListQuerySchema }, async ({ query }) => {
  const r = await listRevisions(getDb(), query);
  return { data: r.data, meta: r.meta };
});
