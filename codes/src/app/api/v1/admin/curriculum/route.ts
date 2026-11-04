import { getDb } from '@/server/db';
import { getCurriculum } from '@/server/curation/service';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin' }, async () => ({ data: await getCurriculum(getDb()) }));
