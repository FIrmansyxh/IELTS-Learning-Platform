import { CreateInviteRequestSchema, InviteListQuerySchema } from '@/contracts/admin';
import { withApi } from '@/server/http/withApi';
import { createInvite, listInvites } from '@/server/admin/invites';

export const dynamic = 'force-dynamic';

export const POST = withApi({ auth: 'admin', body: CreateInviteRequestSchema }, async ({ user, body, ipHash }) => ({
  status: 201,
  data: await createInvite(user!.id, body.expires_in_days, ipHash),
}));

export const GET = withApi({ auth: 'admin', query: InviteListQuerySchema }, async ({ query }) => {
  const { rows, total } = await listInvites(query);
  return { data: rows, meta: { page: query.page, page_size: query.page_size, total } };
});
