import { CreateSourceBodySchema } from '@/contracts/assets';
import { withApi } from '@/server/http/withApi';
import { createSource, listSources } from '@/server/assets/registry';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin' }, async () => ({ data: await listSources() }));

export const POST = withApi({ auth: 'admin', body: CreateSourceBodySchema }, async ({ user, body, ipHash }) => ({
  status: 201,
  data: await createSource(user!.id, body, ipHash),
}));
