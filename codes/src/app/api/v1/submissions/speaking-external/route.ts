import { ExternalSpeakingEvaluationRequestSchema } from '@/contracts/ai';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { recordExternalSpeakingEvaluation } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

/** ADR-004: skor Speaking dari AI pihak ketiga yang dimasukkan pengguna. Overall dihitung server. */
export const POST = withApi(
  {
    auth: 'user',
    body: ExternalSpeakingEvaluationRequestSchema,
  },
  async ({ user, body }) => {
    const result = await recordExternalSpeakingEvaluation(getDb(), user!.id, body);
    return { status: 201, data: result };
  },
);
