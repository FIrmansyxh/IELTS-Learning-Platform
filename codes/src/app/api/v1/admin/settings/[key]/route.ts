import { SettingKeyParamSchema, UpdateSettingRequestSchema } from '@/contracts/admin';
import { withApi } from '@/server/http/withApi';
import { updateSetting } from '@/server/admin/settings';

export const dynamic = 'force-dynamic';

export const PUT = withApi(
  { auth: 'admin', params: SettingKeyParamSchema, body: UpdateSettingRequestSchema },
  async ({ user, params, body, ipHash }) => ({ data: await updateSetting(user!.id, params.key, body.value, ipHash) }),
);
