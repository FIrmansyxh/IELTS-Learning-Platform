import { z } from 'zod';
import { UpdateQuestionRequestSchema } from '@/contracts/curation';
import { QUESTION_ID_RE } from '@/contracts/content';
import { Uuid } from '@/contracts/common';
import { getDb } from '@/server/db';
import { updateQuestion } from '@/server/curation/service';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

const Params = z.strictObject({ set_id: Uuid, question_id: z.string().max(40).regex(QUESTION_ID_RE) });

export const PATCH = withApi({ auth: 'admin', params: Params, body: UpdateQuestionRequestSchema }, async ({ user, ipHash, params, body }) => ({
  data: await updateQuestion(getDb(), { id: user!.id, ipHash }, params.set_id, params.question_id, body),
}));
