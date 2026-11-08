import { ActiveTrackRequestSchema } from '@/contracts/tracks';
import { withApi } from '@/server/http/withApi';
import { setActiveTrack } from '@/server/tracks/service';

export const dynamic = 'force-dynamic';

/** PUT /api/v1/me/active-track (SPEC-021): mengganti jalur aktif profil. */
export const PUT = withApi(
  {
    auth: 'user',
    body: ActiveTrackRequestSchema,
  },
  async ({ user, body }) => {
    await setActiveTrack(user!.id, body.track_code);
    return { status: 204 };
  },
);
