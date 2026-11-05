import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { SectionParamsSchema } from '@/server/attempts/schemas';
import { submitBossSection } from '@/server/exams/boss';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  {
    auth: 'user',
    params: SectionParamsSchema,
  },
  async ({ user, params }) => {
    const data = await submitBossSection(getDb(), user!.id, params.attempt_id, params.section_set_id);
    return { data };
  },
);

