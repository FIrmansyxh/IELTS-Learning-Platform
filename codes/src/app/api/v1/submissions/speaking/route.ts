import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { createSpeakingSubmission } from '@/server/ai/speaking';

export const dynamic = 'force-dynamic';

// Multipart dibaca sendiri dengan batas ukuran yang ditegakkan saat aliran dibaca (raw: true).
export const POST = withApi({ auth: 'user', raw: true, rateLimit: [{ bucket: 'upload_recording', key: 'user' }] }, async ({ user, req }) => ({
  status: 202,
  data: await createSpeakingSubmission(getDb(), user!, req),
}));
