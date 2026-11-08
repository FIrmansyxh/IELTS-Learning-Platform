import { withApi } from '@/server/http/withApi';
import { getTracks } from '@/server/tracks/service';

export const dynamic = 'force-dynamic';

/** GET /api/v1/tracks (SPEC-021): daftar jalur belajar PUBLISHED urut sort_order. */
export const GET = withApi({ auth: 'user' }, async ({ user }) => ({
  data: await getTracks(user!.id),
}));
