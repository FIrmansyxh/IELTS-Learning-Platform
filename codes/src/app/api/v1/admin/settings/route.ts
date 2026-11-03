import { withApi } from '@/server/http/withApi';
import { listSettings } from '@/server/admin/settings';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin' }, async () => ({ data: await listSettings() }));
