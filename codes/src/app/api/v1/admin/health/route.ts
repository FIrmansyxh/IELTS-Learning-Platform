import { withApi } from '@/server/http/withApi';
import { getAdminHealth } from '@/server/admin/health';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin' }, async () => ({ data: await getAdminHealth() }));
