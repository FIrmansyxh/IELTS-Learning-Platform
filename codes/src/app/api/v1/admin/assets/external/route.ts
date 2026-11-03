import { CreateExternalAssetBodySchema } from '@/contracts/assets';
import { withApi } from '@/server/http/withApi';
import { createExternalAsset } from '@/server/assets/registry';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'admin', body: CreateExternalAssetBodySchema }, async ({ user, body, ipHash }) => ({
  status: 201,
  data: await createExternalAsset(user!.id, body, ipHash),
}));
