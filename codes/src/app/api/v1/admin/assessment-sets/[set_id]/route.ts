import { z } from 'zod';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import {
  getAssessmentSetDetail,
  updateAssessmentSet,
} from '@/server/content/curation-service';
import { UpdateAssessmentSetRequestSchema } from '@/contracts/curation';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'admin',
    params: z.object({ set_id: z.string().uuid() }),
  },
  async ({ params }) => {
    const data = await getAssessmentSetDetail(getDb(), params.set_id);
    return {
      status: 200,
      data,
    };
  },
);

export const PATCH = withApi(
  {
    auth: 'admin',
    params: z.object({ set_id: z.string().uuid() }),
    body: UpdateAssessmentSetRequestSchema,
  },
  async ({ user, params, body }) => {
    return await getDb().transaction(async (tx) => {
      const data = await updateAssessmentSet(tx, params.set_id, body, user!.id);
      return {
        status: 200,
        data,
      };
    });
  },
);

