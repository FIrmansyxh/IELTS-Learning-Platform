import { z } from 'zod';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { updateModule } from '@/server/content/curation-service';
import { UpdateModuleRequestSchema } from '@/contracts/curation';

export const dynamic = 'force-dynamic';

export const PATCH = withApi(
  {
    auth: 'admin',
    params: z.object({ module_id: z.string().uuid() }),
    body: UpdateModuleRequestSchema,
  },
  async ({ user, params, body }) => {
    return await getDb().transaction(async (tx) => {
      const data = await updateModule(tx, params.module_id, body, user!.id);
      return {
        status: 200,
        data,
      };
    });
  },
);

