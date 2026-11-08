import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { CreateSimulationRequestSchema } from '@/contracts/simulation';
import { simulationService } from '@/server/simulation/service';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  {
    auth: 'user',
    body: CreateSimulationRequestSchema,
  },
  async ({ user, body }) => {
    const db = getDb();
    const data = await simulationService.createSimulation(db, user!.id, body.sections);
    return { status: 201, data };
  },
);
