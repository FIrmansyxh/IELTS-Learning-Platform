import { z } from 'zod';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import {
  getSubModuleDetail,
  updateSubModule,
} from '@/server/content/curation-service';
import { UpdateSubModuleRequestSchema } from '@/contracts/curation';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'admin',
    params: z.object({ sub_module_id: z.string().uuid() }),
  },
  async ({ params }) => {
    const data = await getSubModuleDetail(getDb(), params.sub_module_id);
    return {
      status: 200,
      data,
    };
  },
);

export const PATCH = withApi(
  {
    auth: 'admin',
    params: z.object({ sub_module_id: z.string().uuid() }),
    body: UpdateSubModuleRequestSchema,
  },
  async ({ user, params, body }) => {
    return await getDb().transaction(async (tx) => {
      const data = await updateSubModule(tx, params.sub_module_id, body, user!.id);
      return {
        status: 200,
        data,
      };
    });
  },
);

