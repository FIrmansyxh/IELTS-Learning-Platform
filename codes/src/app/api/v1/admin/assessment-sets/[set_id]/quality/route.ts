import { z } from 'zod';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getQuestionQuality } from '@/server/content/curation-service';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'admin',
    params: z.object({ set_id: z.string().uuid() }),
  },
  async ({ params }) => {
    const data = await getQuestionQuality(getDb(), params.set_id);
    return {
      status: 200,
      data,
    };
  },
);

