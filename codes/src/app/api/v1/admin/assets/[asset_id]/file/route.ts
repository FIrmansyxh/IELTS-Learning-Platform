import { AssetIdParamSchema } from '@/contracts/assets';
import { withApi } from '@/server/http/withApi';
import { serveAdminAssetFile } from '@/server/assets/registry';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', params: AssetIdParamSchema }, async ({ params, req }) =>
  serveAdminAssetFile(params.asset_id, req.headers.get('range')),
);
