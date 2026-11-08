import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { simulationService } from '@/server/simulation/service';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'user',
  },
  async ({ user }) => {
    const db = getDb();
    const data = await simulationService.getOptions(db, user!.id);
    return { data };
  },
);
