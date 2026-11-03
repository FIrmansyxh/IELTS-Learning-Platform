import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { serveAssetFile } from '@/server/player/assets';
import { AssetIdParamSchema } from '@/server/player/schemas';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user', params: AssetIdParamSchema }, async ({ user, params, req }) =>
  getDb().transaction((tx) => serveAssetFile(tx, user!.id, params.asset_id, req.headers.get('if-none-match'))),
);
