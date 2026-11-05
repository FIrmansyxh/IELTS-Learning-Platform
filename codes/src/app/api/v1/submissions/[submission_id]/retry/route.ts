import { z } from 'zod';
import { Uuid } from '@/contracts/common';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { retrySubmission } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  {
    auth: 'user',
    params: z.object({ submission_id: Uuid }),
  },
  async ({ user, params }) => {
    const result = await retrySubmission(getDb(), user!.id, params.submission_id);
    return {
      status: 202,
      data: result,
    };
  },
);
