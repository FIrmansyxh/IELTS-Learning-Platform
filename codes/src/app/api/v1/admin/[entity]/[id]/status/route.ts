import { z } from 'zod';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { changeEntityStatus } from '@/server/content/curation-service';
import { ChangeStatusRequestSchema } from '@/contracts/curation';
import { ApiError } from '@/server/http/errors';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  {
    auth: 'admin',
    params: z.object({
      entity: z.string(),
      id: z.string().uuid(),
    }),
    body: ChangeStatusRequestSchema,
  },
  async ({ user, params, body }) => {
    if (!['modules', 'sub-modules', 'assessment-sets'].includes(params.entity)) {
      throw new ApiError('NOT_FOUND');
    }

    return await getDb().transaction(async (tx) => {
      const data = await changeEntityStatus(
        tx,
        params.entity,
        params.id,
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

