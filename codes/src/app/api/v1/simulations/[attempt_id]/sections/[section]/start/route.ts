import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { SimulationSectionParamsSchema } from '@/server/simulation/schemas';
import { simulationService } from '@/server/simulation/service';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  {
    auth: 'user',
    params: SimulationSectionParamsSchema,
  },
  async ({ user, params }) => {
    const db = getDb();
    const data = await simulationService.startSection(db, user!.id, params.attempt_id, params.section);
    return { data };
  },
);
