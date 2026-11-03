import { AdminUnlockProgressRequestSchema, UserIdParamSchema } from '@/contracts/admin';
import { withApi } from '@/server/http/withApi';
import { getDb } from '@/server/db';
import { adminOverride } from '@/server/gatekeeping/service';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  { auth: 'admin', params: UserIdParamSchema, body: AdminUnlockProgressRequestSchema },
  async ({ user, params, body, ipHash }) => {
    const r = await getDb().transaction((tx) =>
      adminOverride(tx, user!.id, params.user_id, { level: body.level, targetId: body.target_id }, ipHash),
    );
    return { data: { level: r.level, target_id: r.targetId, status: r.status, unlock_source: r.unlockSource } };
  },
);
