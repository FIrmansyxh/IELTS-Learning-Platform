import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { SimulationAttemptParamsSchema } from '@/server/simulation/schemas';
import { simulationService } from '@/server/simulation/service';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  {
    auth: 'user',
    params: SimulationAttemptParamsSchema,
  },
  async ({ user, params }) => {
    const db = getDb();
    await simulationService.abandonSimulation(db, user!.id, params.attempt_id);
    return { status: 204 };
  },
);
