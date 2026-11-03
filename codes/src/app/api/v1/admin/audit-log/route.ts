import { AuditLogQuerySchema } from '@/contracts/admin';
import { withApi } from '@/server/http/withApi';
import { listAuditLog } from '@/server/admin/audit';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', query: AuditLogQuerySchema }, async ({ query }) => {
  const { rows, total } = await listAuditLog(query);
  return { data: rows, meta: { page: query.page, page_size: query.page_size, total } };
});
