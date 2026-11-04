import { IdParam } from '@/contracts/curation';
import { getDb } from '@/server/db';
import { getQuality } from '@/server/curation/service';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', params: IdParam('set_id') }, async ({ params }) => ({ data: await getQuality(getDb(), params.set_id as string) }));
