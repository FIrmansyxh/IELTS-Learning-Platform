import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getRadarData } from '@/server/skills/service';
import type { RadarDataDTO } from '@/contracts/skills';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'user',
  },
  async ({ user }): Promise<{ status: 200; data: RadarDataDTO }> => {
    const result = await getRadarData(getDb(), user!.id);
    return {
      status: 200,
      data: result,
    };
  },
);

