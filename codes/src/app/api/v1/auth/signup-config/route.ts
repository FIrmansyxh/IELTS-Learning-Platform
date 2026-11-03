import { withApi } from '@/server/http/withApi';
import { getSignupMode } from '@/server/auth/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'public' }, async () => ({ data: { mode: await getSignupMode() } }));
