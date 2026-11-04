import { ExamHistoryQuerySchema } from '@/contracts/skills';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { listExamHistory } from '@/server/skills/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'user', query: ExamHistoryQuerySchema }, async ({ user, query }) => {
  const r = await listExamHistory(getDb(), user!.id, { assessmentType: query.assessment_type, page: query.page, pageSize: query.page_size });
  return { data: r.data, meta: r.meta };
});
