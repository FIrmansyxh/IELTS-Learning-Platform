import {
  ExamHistoryQuerySchema,
  type ExamHistoryResponse,
} from '@/contracts/skills';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { getExamHistory } from '@/server/skills/service';

export const dynamic = 'force-dynamic';

export const GET = withApi(
  {
    auth: 'user',
    query: ExamHistoryQuerySchema,
  },
  async ({
    user,
    query,
  }): Promise<{
    status: 200;
    data: ExamHistoryResponse['data'];
    meta: ExamHistoryResponse['meta'];
  }> => {
    const result = await getExamHistory(getDb(), user!.id, query);
    return {
      status: 200,
      data: result.data,
      meta: result.meta,
    };
  },
);

