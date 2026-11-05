import { z } from 'zod';
import { SelfAssessmentRequestSchema } from '@/contracts/ai';
import { Uuid } from '@/contracts/common';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { selfAssessSubmission } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  {
    auth: 'user',
    params: z.object({ submission_id: Uuid }),
    body: SelfAssessmentRequestSchema,
  },
  async ({ user, params, body }) => {
    const result = await selfAssessSubmission(
      getDb(),
      user!.id,
      params.submission_id,
      body.criteria_scores,
    );
    return {
      status: 201,
      data: result,
    };
  },
);
