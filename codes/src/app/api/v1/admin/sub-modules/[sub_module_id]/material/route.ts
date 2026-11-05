import { z } from 'zod';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { updateMaterial } from '@/server/content/curation-service';
import { UpdateMaterialRequestSchema } from '@/contracts/curation';

export const dynamic = 'force-dynamic';

export const PATCH = withApi(
  {
    auth: 'admin',
    params: z.object({ sub_module_id: z.string().uuid() }),
    body: UpdateMaterialRequestSchema,
  },
  async ({ user, params, body }) => {
    return await getDb().transaction(async (tx) => {
      const data = await updateMaterial(tx, params.sub_module_id, body, user!.id);
      return {
        status: 200,
        data,
      };
    });
  },
);

