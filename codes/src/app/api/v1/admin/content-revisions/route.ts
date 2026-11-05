import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getContentRevisions } from '@/server/content/curation-service';
import { ContentRevisionsQuerySchema } from '@/contracts/curation';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'admin',
    query: ContentRevisionsQuerySchema,
  },
  async ({ query }) => {
    const result = await getContentRevisions(getDb(), query);
    return {
      status: 200,
      data: result.data,
      meta: result.meta,
    };
  },
);

