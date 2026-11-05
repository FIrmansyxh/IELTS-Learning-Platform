import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getUserStats } from '@/server/gamification/service';
import type { StatsDTO } from '@/contracts/gamification';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  { auth: 'user' },
  async ({ user }): Promise<{ status: 200; data: StatsDTO }> => {
    const stats = await getUserStats(getDb(), user!.id);
    return {
      status: 200,
      data: stats,
    };
  },
);

