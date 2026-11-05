import { z } from 'zod';
import { Uuid } from '@/contracts/common';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getSubmission } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'admin',
    params: z.object({ submission_id: Uuid }),
  },
  async ({ user, params }) => {
    const submission = await getSubmission(getDb(), user!.id, params.submission_id, true);
    return {
      status: 200,
      data: { submission },
    };
  },
);
