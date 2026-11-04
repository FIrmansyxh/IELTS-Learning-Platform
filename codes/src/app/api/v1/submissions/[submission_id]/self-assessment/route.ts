import { SelfAssessmentRequestSchema, SubmissionParamsSchema } from '@/contracts/ai';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { selfAssess } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'user', params: SubmissionParamsSchema, body: SelfAssessmentRequestSchema }, async ({ user, params, body }) => ({
  status: 201,
  data: await selfAssess(getDb(), user!.id, params.submission_id, body),
}));
