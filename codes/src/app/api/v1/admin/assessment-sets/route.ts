import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getAssessmentSetsList } from '@/server/content/curation-service';
import { AssessmentSetsQuerySchema } from '@/contracts/curation';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'admin',
    query: AssessmentSetsQuerySchema,
  },
  async ({ query }) => {
    const result = await getAssessmentSetsList(getDb(), query);
    return {
      status: 200,
      data: result.data,
      meta: result.meta,
    };
  },
);

