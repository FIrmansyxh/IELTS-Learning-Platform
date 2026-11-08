import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { listBanks } from '@/server/mix/service';

export const dynamic = 'force-dynamic';

/** GET /api/v1/banks (SPEC-022): bank soal PUBLISHED, tanpa kunci jawaban. */
export const GET = withApi({ auth: 'user' }, async () => ({ data: await listBanks(getDb()) }));
