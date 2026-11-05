import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getCurriculumTree } from '@/server/content/curation-service';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'admin',
  },
  async () => {
    const data = await getCurriculumTree(getDb());
    return {
      status: 200,
      data,
    };
  },
);

