import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getAiStatus } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'user',
  },
  async ({ user }) => {
    const result = await getAiStatus(getDb(), user!.id);
    return {
      status: 200,
      data: result,
    };
  },
);
