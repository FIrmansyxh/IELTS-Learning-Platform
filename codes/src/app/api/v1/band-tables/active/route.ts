import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getActiveTables } from '@/server/band/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user' }, async () => ({ data: await getActiveTables(getDb()) }));
