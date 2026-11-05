import { z } from 'zod';
import { Uuid } from '@/contracts/common';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getRecordingStream } from '@/server/ai/service';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'admin',
    params: z.object({ submission_id: Uuid }),
  },
  async ({ req, user, params }) => {
    const rangeHeader = req.headers.get('range');
    const result = await getRecordingStream(
      getDb(),
      user!.id,
      params.submission_id,
      rangeHeader,
      true,
    );
    return new Response(result.stream, {
      status: result.status,
      headers: result.headers,
    });
  },
);
