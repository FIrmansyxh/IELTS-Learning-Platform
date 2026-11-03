import { TemplateKindParamSchema } from '@/contracts/import';
import { notFound } from '@/server/http/errors';
import { withApi } from '@/server/http/withApi';
import { templateFor } from '@/server/import/templates';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', params: TemplateKindParamSchema }, async ({ params }) => {
  const t = templateFor(params.kind);
  if (!t) throw notFound();
  return new Response(t.body, {
    status: 200,
    headers: {
      'Content-Type': t.contentType,
      'Content-Disposition': `attachment; filename="${t.filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
});
