import { z } from 'zod';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getContentRevisionDetail } from '@/server/content/curation-service';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'admin',
    params: z.object({ revision_id: z.string().uuid() }),
  },
  async ({ params }) => {
    const data = await getContentRevisionDetail(getDb(), params.revision_id);
    return {
      status: 200,
      data,
    };
  },
);

