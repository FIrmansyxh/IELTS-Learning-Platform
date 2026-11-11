import type { ReviewSummary } from '@/contracts/review';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getReviewSummary } from '@/server/review/service';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/reviews (SPEC-026 D5): ringkasan soal yang dijadwalkan untuk diulang. */
export const GET = withApi(
  { auth: 'user' },
  async ({ user }): Promise<{ status: 200; data: ReviewSummary }> => ({ status: 200, data: await getReviewSummary(getDb(), user!.id) }),
);
