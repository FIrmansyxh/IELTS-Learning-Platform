import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { contentAssets } from '@/db/schema';
import type { Tx } from '../db';
import { lockReasonOf } from '../gatekeeping/rules';
import { recomputeStatuses } from '../gatekeeping/service';
import { ApiError, notFound } from '../http/errors';
import { logger } from '../logger';
import { getStorage } from '../storage';
import { etagMatches, SERVABLE_MIMES, slugifyTitle } from './rules';
import { execute } from '@/server/db';

const CACHE_CONTROL = 'private, max-age=3600';
const SERVABLE_KINDS = new Set(['SLIDE_IMAGE', 'IMAGE', 'DOCUMENT']);

/**
 * GET /assets/{asset_id}/file (SPEC-005). Aset hanya dilayani bila dirujuk `slides_json`/`attachments_json` sub-modul
 * PUBLISHED yang statusnya BUKAN LOCKED bagi pengguna. Tanpa Range (selalu 200 penuh) dan tanpa membocorkan path.
 */
export async function serveAssetFile(tx: Tx, userId: string, assetId: string, ifNoneMatch: string | null): Promise<Response> {
  const [asset] = await tx
    .select({
      kind: contentAssets.kind,
      title: contentAssets.title,
      mimeType: contentAssets.mimeType,
      sha256: contentAssets.sha256,
      storageKey: contentAssets.storageKey,
      storageBackend: contentAssets.storageBackend,
    })
    .from(contentAssets)
    .where(eq(contentAssets.id, assetId))
    .limit(1);
  if (!asset || !SERVABLE_KINDS.has(asset.kind)) throw notFound();
  const mime = asset.mimeType ? SERVABLE_MIMES[asset.mimeType] : undefined;
  if (!mime || asset.storageBackend === 'EXTERNAL' || !asset.storageKey) throw notFound();

  const refs = await execute(tx, sql`
    SELECT s.id FROM learning_materials lm
    JOIN sub_modules s ON s.id = lm.sub_module_id AND s.status = 'PUBLISHED'
    JOIN modules m ON m.id = s.module_id AND m.status = 'PUBLISHED'
    WHERE EXISTS (SELECT 1 FROM json_each(lm.slides_json) e WHERE json_extract(e.value, '$.asset_id') = ${assetId})
       OR EXISTS (SELECT 1 FROM json_each(lm.attachments_json) e WHERE json_extract(e.value, '$.asset_id') = ${assetId})`);
  const subIds = new Set((refs.rows as Array<{ id: string }>).map((r) => r.id));
  if (subIds.size === 0) throw notFound();

  const snap = await recomputeStatuses(tx, userId);
  let open = false;
  let firstLocked: ApiError | null = null;
  for (const tier of snap.tiers) {
    for (const mod of tier.modules) {
      for (const sub of mod.subs) {
        if (!subIds.has(sub.id)) continue;
        if (sub.status !== 'LOCKED') open = true;
        else if (!firstLocked) {
          const r = lockReasonOf(tier, mod, sub);
          firstLocked = new ApiError('LOCKED_CONTENT', {
            details: [{ path: 'asset_id', code: !r || r.code === 'NOT_PUBLISHED' ? 'PREVIOUS_INCOMPLETE' : r.code, message: r?.message ?? 'Materi ini masih terkunci.' }],
          });
        }
      }
    }
  }
  if (!open) throw firstLocked ?? notFound();

  let data: Buffer;
  try {
    data = await getStorage().get(asset.storageKey);
  } catch {
    logger.error({ assetId }, 'asset_file_missing'); // tanpa path storage
    throw notFound();
  }
  const sha = asset.sha256 ?? createHash('sha256').update(data).digest('hex');
  const etag = `"${sha}"`;
  const headers: Record<string, string> = {
    'Content-Type': asset.mimeType!,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': CACHE_CONTROL,
    ETag: etag,
  };
  if (etagMatches(ifNoneMatch, etag)) return new Response(null, { status: 304, headers });

  headers['Content-Length'] = String(data.length);
  headers['Content-Disposition'] = asset.kind !== 'DOCUMENT' ? 'inline' : `attachment; filename="${slugifyTitle(asset.title)}.${mime.ext}"`;
  return new Response(new Uint8Array(data), { status: 200, headers });
}
