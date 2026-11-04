import { z } from 'zod';
import { Uuid } from '@/contracts/common';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getExamIntro } from '@/server/exams/service';

export const dynamic = 'force-dynamic';

const ParamSchema = z.strictObject({ assessment_set_id: Uuid });

export const GET = withApi({ auth: 'user', params: ParamSchema, rateLimit: [{ bucket: 'exam_intro', key: 'user' }] }, async ({ user, params }) => ({
  data: await getExamIntro(getDb(), user!.id, params.assessment_set_id),
}));
