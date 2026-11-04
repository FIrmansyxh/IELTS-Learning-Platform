import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getPlacementStatus } from '@/server/exams/placement-service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user' }, async ({ user }) => ({
  data: await getPlacementStatus(getDb(), user!.id),
}));
