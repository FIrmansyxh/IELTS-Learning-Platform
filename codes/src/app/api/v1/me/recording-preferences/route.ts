import { RecordingPreferencesRequestSchema } from '@/contracts/ai';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { toUserDTO } from '@/server/auth/guards';
import { setRecordingPreferences } from '@/server/ai/speaking';

export const dynamic = 'force-dynamic';

export const PATCH = withApi({ auth: 'user', body: RecordingPreferencesRequestSchema }, async ({ user, body }) => ({
  data: { user: toUserDTO(await setRecordingPreferences(getDb(), user!.id, body.keep_recordings)) },
}));
