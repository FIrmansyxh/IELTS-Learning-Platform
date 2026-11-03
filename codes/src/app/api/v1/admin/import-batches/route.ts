import { BatchListQuerySchema, CreateImportBatchFieldsSchema, IMPORT_MAX_BYTES } from '@/contracts/import';
import { ApiError, validationError } from '@/server/http/errors';
import { readMultipart } from '@/server/http/multipart';
import { withApi } from '@/server/http/withApi';
import { zodDetails } from '@/server/http/zod-errors';
import { createBatch, listBatches } from '@/server/import/service';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', query: BatchListQuerySchema }, async ({ query }) => {
  const { rows, total } = await listBatches(query);
  return { data: rows, meta: { page: query.page, page_size: query.page_size, total } };
});

export const POST = withApi({ auth: 'admin', raw: true, rateLimit: [{ bucket: 'import_admin', key: 'user' }] }, async ({ req, user, ipHash }) => {
  const mp = await readMultipart(req, { maxBytes: IMPORT_MAX_BYTES });
  const files = mp.files.filter((f) => f.name === 'file');
  if (mp.files.length > files.length) throw validationError(mp.files.find((f) => f.name !== 'file')!.name, 'unrecognized_key');
  if (files.length === 0) throw validationError('file', 'file_required');
  if (files.length > 1) throw validationError('file', 'multiple_files');
  const parsed = CreateImportBatchFieldsSchema.safeParse(mp.fields);
  if (!parsed.success) throw new ApiError('VALIDATION_ERROR', { details: zodDetails(parsed.error) });
  const file = files[0]!.file;
  if (file.size > IMPORT_MAX_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE');
  const data = Buffer.from(await file.arrayBuffer());
  return { status: 201, data: await createBatch(user!.id, { fields: parsed.data, fileName: file.name, data }, ipHash) };
});
