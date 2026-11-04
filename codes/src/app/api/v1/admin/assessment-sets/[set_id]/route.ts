import { IdParam, UpdateAssessmentSetRequestSchema } from '@/contracts/curation';
import { getDb } from '@/server/db';
import { getSetDetail, updateSet } from '@/server/curation/service';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

const Params = IdParam('set_id');

export const GET = withApi({ auth: 'admin', params: Params }, async ({ params }) => ({ data: await getSetDetail(getDb(), params.set_id as string) }));

export const PATCH = withApi({ auth: 'admin', params: Params, body: UpdateAssessmentSetRequestSchema }, async ({ user, ipHash, params, body }) => ({
  data: await updateSet(getDb(), { id: user!.id, ipHash }, params.set_id as string, body),
}));
