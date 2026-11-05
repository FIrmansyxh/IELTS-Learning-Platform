import { ApplyPlacementRequestSchema } from '@/contracts/placement';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { applyPlacement } from '@/server/exams/placement';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  { auth: 'user', body: ApplyPlacementRequestSchema },
  async ({ user, body, ip }) => {
    const data = await applyPlacement(getDb(), user!.id, body.attempt_id, body.tier_number, ip);
    return { status: 200, data };
  },
);

