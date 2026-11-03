import { withApi } from '@/server/http/withApi';
import { licenseSummary } from '@/server/assets/registry';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin' }, async () => ({ data: await licenseSummary() }));
