import { SubmissionParamsSchema } from '@/contracts/ai';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getSubmission } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user', params: SubmissionParamsSchema, rateLimit: [{ bucket: 'job_poll', key: 'user' }] }, async ({ user, params }) => ({
  data: { submission: await getSubmission(getDb(), params.submission_id, user!.id) },
}));
