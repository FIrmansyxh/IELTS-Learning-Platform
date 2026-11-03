import { AssetIdParamSchema, UpdateAssetBodySchema } from '@/contracts/assets';
import { withApi } from '@/server/http/withApi';
import { deleteAsset, getAsset, updateAsset } from '@/server/assets/registry';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', params: AssetIdParamSchema }, async ({ params }) => ({ data: await getAsset(params.asset_id) }));

export const PATCH = withApi({ auth: 'admin', params: AssetIdParamSchema, body: UpdateAssetBodySchema }, async ({ user, params, body, ipHash }) => ({
  data: await updateAsset(user!.id, params.asset_id, body, ipHash),
}));

export const DELETE = withApi({ auth: 'admin', params: AssetIdParamSchema }, async ({ user, params, ipHash }) => {
  await deleteAsset(user!.id, params.asset_id, ipHash);
  return { status: 204 };
});
