import { AudioStreamParamsSchema, AudioStreamQuerySchema } from '@/contracts/attempts';
import { serveAttemptAudio } from '@/server/attempts/audio';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user', params: AudioStreamParamsSchema, query: AudioStreamQuerySchema, rateLimit: [{ bucket: 'audio_stream', key: 'user' }] }, async ({ user, params, query, req }) =>
  serveAttemptAudio(getDb(), user!.id, params.attempt_id, query.section, req.headers.get('range')),
);
