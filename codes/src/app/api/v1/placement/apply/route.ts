import { ApplyPlacementRequestSchema } from '@/contracts/placement';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { applyPlacement } from '@/server/exams/placement-service';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'user', body: ApplyPlacementRequestSchema }, async ({ user, body }) => ({
  data: await applyPlacement(getDb(), user!.id, body),
}));
