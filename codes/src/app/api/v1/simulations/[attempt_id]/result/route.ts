import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { SimulationAttemptParamsSchema } from '@/server/simulation/schemas';
import { simulationService } from '@/server/simulation/service';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'user',
    params: SimulationAttemptParamsSchema,
  },
  async ({ user, params }) => {
    const db = getDb();
    const data = await simulationService.getResult(db, user!.id, params.attempt_id);
    return { data };
  },
);
