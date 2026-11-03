import { BandTableIdParamSchema } from '@/contracts/band';
import { withApi } from '@/server/http/withApi';
import { activateTable } from '@/server/band/service';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'admin', params: BandTableIdParamSchema }, async ({ user, params, ipHash }) => ({
  data: await activateTable(user!.id, params.table_id, ipHash),
}));
