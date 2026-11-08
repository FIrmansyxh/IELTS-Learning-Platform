import { withApi } from '@/server/http/withApi';
import { getDb } from '@/server/db';
import { getCurriculumTree } from '@/server/gatekeeping/tree';
import { TrackTreeQuerySchema } from '@/contracts/tracks';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user', query: TrackTreeQuerySchema }, async ({ user, query }) => ({
  data: await getCurriculumTree(getDb(), user!.id, query?.track),
}));
