import { z } from 'zod';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getSubModuleDetail } from '@/server/player/service';
import { SubModuleCodeParamSchema } from '@/server/player/schemas';

export const dynamic = 'force-dynamic';

const StyleQuerySchema = z.strictObject({
  style: z.enum(['LEARN_FIRST', 'PRACTICE_FIRST', 'CASE_BASED']).optional(),
});

export const GET = withApi(
  {
    auth: 'user',
    params: SubModuleCodeParamSchema,
    query: StyleQuerySchema,
  },
  async ({ user, params, query }) => ({
    data: await getDb().transaction((tx) =>
      getSubModuleDetail(tx, user!.id, params.sub_module, query?.style),
    ),
  }),
);
