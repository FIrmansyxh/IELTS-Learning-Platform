import { SubmissionParamsSchema } from '@/contracts/ai';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { deleteRecording, serveRecording } from '@/server/ai/speaking';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user', params: SubmissionParamsSchema, rateLimit: [{ bucket: 'audio_stream', key: 'user' }] }, async ({ user, params, req }) =>
  serveRecording(getDb(), { submissionId: params.submission_id, ownerId: user!.id, viewerId: user!.id, range: req.headers.get('range') }),
);

export const DELETE = withApi({ auth: 'user', params: SubmissionParamsSchema }, async ({ user, params }) => {
  await deleteRecording(getDb(), user!.id, params.submission_id);
  return { status: 204 };
});
