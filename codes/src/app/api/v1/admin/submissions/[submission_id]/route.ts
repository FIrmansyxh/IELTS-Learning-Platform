import { SubmissionParamsSchema } from '@/contracts/ai';
import { writeAudit } from '@/server/audit';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { buildSubmissionDTO, loadSubmissionRow } from '@/server/ai/dto';

export const dynamic = 'force-dynamic';

// Akses admin ke tulisan/transkrip pengguna WAJIB tercatat (ADMIN_VIEWED_SUBMISSION).
export const GET = withApi({ auth: 'admin', params: SubmissionParamsSchema }, async ({ user, params, ipHash }) => {
  const db = getDb();
  const row = await loadSubmissionRow(db, params.submission_id, null);
  await writeAudit(db, {
    actorUserId: user!.id,
    action: 'ADMIN_VIEWED_SUBMISSION',
    entityType: 'submission',
    entityId: row.id,
    metadata: { submission_id: row.id, owner_user_id: row.userId },
    ipHash: ipHash || null,
  });
  return { data: { submission: await buildSubmissionDTO(db, row) } };
});
