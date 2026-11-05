import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { loadPlacementAvailability } from '@/server/exams/placement';
import type { PlacementStatusDTO } from '@/contracts/placement';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  { auth: 'user' },
  async ({ user }): Promise<{ status: 200; data: PlacementStatusDTO }> => {
    const avail = await loadPlacementAvailability(getDb(), user!.id);
    return {
      status: 200,
      data: {
        available: avail.available,
        blocked_reason: avail.blocked_reason,
        assessment_set_id: avail.set ? avail.set.id : null,
        question_count: avail.question_count,
        time_limit_seconds: avail.time_limit_seconds,
        completed_at: avail.completed_at,
        active_attempt_id: avail.active_attempt_id,
        pending_result: avail.pending_result,
      },
    };
  },
);

