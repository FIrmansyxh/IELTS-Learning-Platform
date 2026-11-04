import { IdParam } from '@/contracts/curation';
import { getDb } from '@/server/db';
import { getRevision } from '@/server/curation/service';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', params: IdParam('revision_id') }, async ({ params }) => ({ data: await getRevision(getDb(), params.revision_id as string) }));
