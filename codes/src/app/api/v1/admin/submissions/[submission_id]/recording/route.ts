import { SubmissionParamsSchema } from '@/contracts/ai';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { serveRecording } from '@/server/ai/speaking';

export const dynamic = 'force-dynamic';

// Memutar rekaman pengguna oleh admin WAJIB tercatat (ADMIN_PLAYED_RECORDING).
export const GET = withApi({ auth: 'admin', params: SubmissionParamsSchema, rateLimit: [{ bucket: 'audio_stream', key: 'user' }] }, async ({ user, params, req, ipHash }) =>
  serveRecording(getDb(), { submissionId: params.submission_id, ownerId: null, viewerId: user!.id, admin: { ipHash }, range: req.headers.get('range') }),
);
