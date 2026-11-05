import { SubmissionsListQuerySchema } from '@/contracts/ai';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { listSubmissions } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'user',
    query: SubmissionsListQuerySchema,
  },
  async ({ user, query }) => {
    const result = await listSubmissions(getDb(), user!.id, query);
    return {
      status: 200,
      data: result.data,
      meta: result.meta,
    };
  },
);
