import { RecordingPreferencesRequestSchema } from '@/contracts/ai';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { updateRecordingPreferences } from '@/server/ai/service';
import { toSessionUser, toUserDTO } from '@/server/auth/guards';

export const dynamic = 'force-dynamic';

export const PATCH = withApi(
  {
    auth: 'user',
    body: RecordingPreferencesRequestSchema,
  },
  async ({ user, body }) => {
    const updated = await updateRecordingPreferences(getDb(), user!.id, body.keep_recordings);
    return {
      status: 200,
      data: {
        user: toUserDTO(toSessionUser(updated)),
      },
    };
  },
);
