import { SubmissionParamsSchema } from '@/contracts/ai';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { retrySubmission } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'user', params: SubmissionParamsSchema }, async ({ user, params }) => ({
  status: 202,
  data: await retrySubmission(getDb(), user!.id, params.submission_id),
}));
