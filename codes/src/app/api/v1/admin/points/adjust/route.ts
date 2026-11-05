import { AdminAdjustPointsRequestSchema } from '@/contracts/admin';
import { withApi } from '@/server/http/withApi';
import { getDb } from '@/server/db';
import { adminAdjustUserPoints } from '@/server/gamification/service';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  { auth: 'admin', body: AdminAdjustPointsRequestSchema },
  async ({ body }) => {
    const db = getDb();
    const result = await db.transaction(async (tx) => {
      return adminAdjustUserPoints(tx, {
        userId: body.userId,
        points: body.points,
        note: body.note,
      });
    });
    return { data: result };
  },
);
