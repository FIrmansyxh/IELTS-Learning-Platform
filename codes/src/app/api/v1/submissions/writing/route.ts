import { CreateWritingSubmissionRequestSchema } from '@/contracts/ai';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { createWritingSubmission } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'user', body: CreateWritingSubmissionRequestSchema }, async ({ user, body }) => ({
  status: 202,
  data: await createWritingSubmission(getDb(), user!.id, body),
}));
