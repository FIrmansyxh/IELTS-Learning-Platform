import { BandTableIdParamSchema } from '@/contracts/band';
import { withApi } from '@/server/http/withApi';
import { deleteTable, getTable } from '@/server/band/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', params: BandTableIdParamSchema }, async ({ params }) => ({
  data: await getTable(params.table_id),
}));

export const DELETE = withApi({ auth: 'admin', params: BandTableIdParamSchema }, async ({ user, params, ipHash }) => {
  await deleteTable(user!.id, params.table_id, ipHash);
  return { status: 204 };
});
