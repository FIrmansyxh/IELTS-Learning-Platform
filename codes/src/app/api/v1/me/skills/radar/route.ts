import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getRadar } from '@/server/skills/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user' }, async ({ user }) => ({ data: await getRadar(getDb(), user!.id) }));
