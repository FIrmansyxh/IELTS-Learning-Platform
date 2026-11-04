import { SectionParamsSchema } from '@/contracts/exams';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { startSection } from '@/server/attempts/sections';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'user', params: SectionParamsSchema, rateLimit: [{ bucket: 'section_action', key: 'user' }] }, async ({ user, params }) => ({
  data: await startSection(getDb(), user!.id, params.attempt_id, params.section_set_id),
}));
