import { BandTableListQuerySchema, CreateBandTableBodySchema } from '@/contracts/band';
import { withApi } from '@/server/http/withApi';
import { createTable, listTables } from '@/server/band/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', query: BandTableListQuerySchema }, async ({ query }) => ({
  data: await listTables(query.skill),
}));

export const POST = withApi({ auth: 'admin', body: CreateBandTableBodySchema }, async ({ user, body, ipHash }) => ({
  status: 201,
  data: await createTable(user!.id, body, ipHash),
}));
