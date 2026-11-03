import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { submitAnswer } from '@/server/attempts/service';
import { AnswerParamsSchema, SubmitAnswerBodySchema } from '@/server/attempts/schemas';

export const dynamic = 'force-dynamic';

export const PUT = withApi(
  { auth: 'user', params: AnswerParamsSchema, body: SubmitAnswerBodySchema, rateLimit: [{ bucket: 'answer_submit', key: 'user' }] },
  async ({ user, params, body }) => ({
    data: await submitAnswer(getDb(), user!.id, params.attempt_id, params.question_id, body.response),
  }),
);
