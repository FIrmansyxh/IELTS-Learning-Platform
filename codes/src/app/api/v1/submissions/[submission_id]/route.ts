import { z } from 'zod';
import { Uuid } from '@/contracts/common';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getSubmission } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'user',
    params: z.object({ submission_id: Uuid }),
    rateLimit: [{ bucket: 'job_poll', key: 'user' }],
  },
  async ({ user, params }) => {
    const submission = await getSubmission(getDb(), user!.id, params.submission_id);
    return {
      status: 200,
      data: { submission },
    };
  },
);
