import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getActiveMixSession } from '@/server/mix/service';

export const dynamic = 'force-dynamic';

/** GET /api/v1/mix-sessions/active (SPEC-022): sesi MIX_PRACTICE IN_PROGRESS milik profil, atau `data: null`. */
export const GET = withApi({ auth: 'user' }, async ({ user }) => ({ data: await getActiveMixSession(getDb(), user!.id) }));
