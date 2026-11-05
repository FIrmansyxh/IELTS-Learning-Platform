import { z } from 'zod';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { updateQuestionInSet } from '@/server/content/curation-service';
import { UpdateQuestionRequestSchema } from '@/contracts/curation';

export const dynamic = 'force-dynamic';

export const PATCH = withApi(
  {
    auth: 'admin',
    params: z.object({
      set_id: z.string().uuid(),
      question_id: z.string().min(1).max(40),
    }),
    body: UpdateQuestionRequestSchema,
  },
  async ({ user, params, body }) => {
    return await getDb().transaction(async (tx) => {
      const data = await updateQuestionInSet(
        tx,
        params.set_id,
        params.question_id,
        body,
        user!.id,
      );
      return {
        status: 200,
        data,
      };
    });
  },
);

