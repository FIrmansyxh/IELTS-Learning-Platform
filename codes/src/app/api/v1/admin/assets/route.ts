import { AssetListQuerySchema, UploadAssetFieldsSchema } from '@/contracts/assets';
import { uploadLimitBytes } from '@/server/content/assets';
import { ApiError, validationError } from '@/server/http/errors';
import { readMultipart } from '@/server/http/multipart';
import { withApi } from '@/server/http/withApi';
import { zodDetails } from '@/server/http/zod-errors';
import { listAssets, uploadAsset } from '@/server/assets/registry';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin', query: AssetListQuerySchema }, async ({ query }) => {
  const { rows, total } = await listAssets(query);
  return { data: rows, meta: { page: query.page, page_size: query.page_size, total } };
});

const KINDS = ['SLIDE_IMAGE', 'IMAGE', 'DOCUMENT', 'AUDIO_LISTENING'];
const MAX = Math.max(...KINDS.map(uploadLimitBytes));

export const POST = withApi({ auth: 'admin', raw: true }, async ({ req, user, ipHash }) => {
  const mp = await readMultipart(req, { maxBytes: MAX, limitForKind: (k) => (KINDS.includes(k) ? uploadLimitBytes(k) : undefined) });
  const files = mp.files.filter((f) => f.name === 'file');
  if (mp.files.length > files.length) throw validationError(mp.files.find((f) => f.name !== 'file')!.name, 'unrecognized_key');
  if (files.length === 0) throw validationError('file', 'file_required');
  if (files.length > 1) throw validationError('file', 'multiple_files');
  const parsed = UploadAssetFieldsSchema.safeParse(mp.fields);
  if (!parsed.success) throw new ApiError('VALIDATION_ERROR', { details: zodDetails(parsed.error) });
  const file = files[0]!.file;
  const data = Buffer.from(await file.arrayBuffer());
  if (data.length === 0) throw validationError('file', 'file_required');
  return { status: 201, data: await uploadAsset(user!.id, { fields: parsed.data, file: { data } }, ipHash) };
});
