/**
 * AssetRegistryService (SPEC-018): sumber konten, unggah aman, aset eksternal, verifikasi lisensi, penghapusan, ringkasan.
 * Semua penulisan memakai transaksi + audit_log. Tidak ada fetch jaringan (anti-SSRF).
 */
import { createHash } from 'node:crypto';
import { and, asc, count, desc, eq, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { contentAssets, contentSources, users } from '@/db/schema';
import type {
  AssetListQuery,
  CreateExternalAssetBody,
  CreateSourceBody,
  UpdateAssetBody,
  UpdateSourceBody,
  UploadAssetFields,
} from '@/contracts/assets';
import { ALLOWED_RIGHTS_BY_KIND, type AssetKindValue } from '@/contracts/assets';
import { writeAudit } from '../audit';
import { getDb, type DbOrTx, type Tx } from '../db';
import { ApiError, notFound, validationError } from '../http/errors';
import { logger } from '../logger';
import { getStorage, type StorageDir, type StorageDriver } from '../storage';
import { uploadLimitBytes, validateAssetBytes } from '../content/assets';
import { fkViolation, uniqueViolation } from './pg-errors';

const KIND_DIR: Record<string, StorageDir> = {
  SLIDE_IMAGE: 'public/slides',
  IMAGE: 'public/images',
  DOCUMENT: 'public/documents',
  AUDIO_LISTENING: 'public/audio',
};

const OPEN_LICENSES = ['CC0', 'CC_BY', 'CC_BY_SA', 'CC_BY_NC', 'MIT'];
const NO_COPY_LICENSES = ['LINK_ONLY_COPYRIGHTED', 'EMBED_TOS'];
const YT_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'youtu.be', 'www.youtube-nocookie.com']);
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// ------------------------------------------------------------------ DTO
type SourceRow = typeof contentSources.$inferSelect;

const sourceDto = (s: SourceRow, assetCount: number) => ({
  id: s.id,
  code: s.code,
  name: s.name,
  url: s.url,
  license_type: s.licenseType,
  license_note: s.licenseNote,
  attribution_template: s.attributionTemplate,
  share_alike: s.shareAlike,
  non_commercial_only: s.nonCommercialOnly,
  may_store_copy: s.mayStoreCopy,
  asset_count: assetCount,
});

const verifier = alias(users, 'verifier');

const assetSelect = {
  a: contentAssets,
  srcCode: contentSources.code,
  srcName: contentSources.name,
  srcLicense: contentSources.licenseType,
  verifierName: verifier.displayName,
};
type AssetJoined = {
  a: typeof contentAssets.$inferSelect;
  srcCode: string;
  srcName: string;
  srcLicense: string;
  verifierName: string | null;
};

/** AssetDTO: tanpa storage_key dan sha256. */
export function assetDto(r: AssetJoined) {
  const a = r.a;
  return {
    id: a.id,
    asset_code: a.assetCode,
    kind: a.kind,
    title: a.title,
    source: { id: a.sourceId, code: r.srcCode, name: r.srcName, license_type: r.srcLicense },
    rights_status: a.rightsStatus,
    storage_backend: a.storageBackend,
    mime_type: a.mimeType,
    size_bytes: a.sizeBytes,
    duration_sec: a.durationSec,
    external_url: a.externalUrl,
    external_ref: a.externalRef,
    attribution_text: a.attributionText,
    license_verified_at: a.licenseVerifiedAt ? a.licenseVerifiedAt.toISOString() : null,
    license_verified_by_name: r.verifierName,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
  };
}

async function loadAssetDto(db: DbOrTx, id: string) {
  const [r] = await db
    .select(assetSelect)
    .from(contentAssets)
    .innerJoin(contentSources, eq(contentSources.id, contentAssets.sourceId))
    .leftJoin(verifier, eq(verifier.id, contentAssets.licenseVerifiedBy))
    .where(eq(contentAssets.id, id));
  return r ? assetDto(r) : null;
}

// ------------------------------------------------------------------ rujukan konten
const refPredicate = (assetId: SQL | string) => sql`(
  lm.slides_json @> jsonb_build_array(jsonb_build_object('asset_id', ${assetId}::text))
  OR lm.attachments_json @> jsonb_build_array(jsonb_build_object('asset_id', ${assetId}::text))
  OR lm.videos_json @> jsonb_build_array(jsonb_build_object('asset_id', ${assetId}::text)))`;

const referenceCountSql = sql<number>`((
  SELECT count(*) FROM learning_materials lm WHERE ${refPredicate(sql`"content_assets"."id"`)})
  + (SELECT count(*) FROM assessment_sets s WHERE s.listening_asset_id = "content_assets"."id"))::int`;

interface Ref {
  entity_type: 'SUB_MODULE' | 'ASSESSMENT_SET';
  entity_id: string;
  label: string;
  status: string;
}
async function referencesOf(db: DbOrTx, assetId: string): Promise<Ref[]> {
  const res = await db.execute(sql`
    SELECT 'SUB_MODULE'::text AS entity_type, s.id::text AS entity_id, (s.sub_module_code || ' ' || s.title) AS label, s.status::text AS status
    FROM learning_materials lm JOIN sub_modules s ON s.id = lm.sub_module_id
    WHERE ${refPredicate(assetId)}
    UNION ALL
    SELECT 'ASSESSMENT_SET'::text, a.id::text, a.title, a.status::text
    FROM assessment_sets a WHERE a.listening_asset_id = ${assetId}::uuid
    ORDER BY 1, 3`);
  return res.rows as unknown as Ref[];
}

// ------------------------------------------------------------------ sumber
export async function listSources() {
  const db = getDb();
  const rows = await db.select().from(contentSources).orderBy(asc(contentSources.code));
  const counts = await db.select({ id: contentAssets.sourceId, n: count() }).from(contentAssets).groupBy(contentAssets.sourceId);
  const byId = new Map(counts.map((c) => [c.id, Number(c.n)]));
  return rows.map((s) => sourceDto(s, byId.get(s.id) ?? 0));
}

async function sourceAssetCount(db: DbOrTx, id: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(contentAssets).where(eq(contentAssets.sourceId, id));
  return Number(r?.n ?? 0);
}

export async function createSource(actorId: string, body: CreateSourceBody, ipHash: string | null) {
  const lic = body.license_type;
  const values = {
    code: body.code,
    name: body.name,
    url: body.url ?? null,
    licenseType: lic,
    licenseNote: body.license_note ?? null,
    attributionTemplate: body.attribution_template ?? null,
    shareAlike: body.share_alike ?? lic === 'CC_BY_SA',
    nonCommercialOnly: body.non_commercial_only ?? lic === 'CC_BY_NC',
    mayStoreCopy: body.may_store_copy ?? false,
  };
  try {
    return await getDb().transaction(async (tx) => {
      const [row] = await tx.insert(contentSources).values(values).returning();
      await writeAudit(tx, { actorUserId: actorId, action: 'SOURCE_CREATED', entityType: 'content_source', entityId: row!.id, metadata: { code: row!.code, license_type: lic }, ipHash });
      return sourceDto(row!, 0);
    });
  } catch (e) {
    if (uniqueViolation(e) !== null) throw new ApiError('SOURCE_CODE_TAKEN', { status: 409, message: 'Kode sumber sudah dipakai.' });
    throw e;
  }
}

export async function updateSource(actorId: string, id: string, body: UpdateSourceBody, ipHash: string | null) {
  return getDb().transaction(async (tx) => {
    const [cur] = await tx.select().from(contentSources).where(eq(contentSources.id, id)).for('update');
    if (!cur) throw notFound();
    if (body.may_store_copy === true && NO_COPY_LICENSES.includes(cur.licenseType)) {
      throw validationError('may_store_copy', 'store_copy_not_allowed', 'Sumber tautan-saja atau embed tidak boleh disimpan salinannya.');
    }
    if (body.may_store_copy === false && cur.mayStoreCopy) {
      const [stored] = await tx
        .select({ n: count() })
        .from(contentAssets)
        .where(and(eq(contentAssets.sourceId, id), sql`${contentAssets.storageKey} IS NOT NULL`));
      if (Number(stored?.n ?? 0) > 0) {
        throw new ApiError('SOURCE_IN_USE', { status: 409, message: 'Sumber ini masih memiliki aset tersimpan berkas.' });
      }
    }
    const set: Partial<typeof contentSources.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) set.name = body.name;
    if (body.url !== undefined) set.url = body.url;
    if (body.license_note !== undefined) set.licenseNote = body.license_note;
    if (body.attribution_template !== undefined) set.attributionTemplate = body.attribution_template;
    if (body.share_alike !== undefined) set.shareAlike = body.share_alike;
    if (body.non_commercial_only !== undefined) set.nonCommercialOnly = body.non_commercial_only;
    if (body.may_store_copy !== undefined) set.mayStoreCopy = body.may_store_copy;
    const [row] = await tx.update(contentSources).set(set).where(eq(contentSources.id, id)).returning();
    await writeAudit(tx, { actorUserId: actorId, action: 'SOURCE_UPDATED', entityType: 'content_source', entityId: id, metadata: { fields: Object.keys(body) }, ipHash });
    return sourceDto(row!, await sourceAssetCount(tx, id));
  });
}

// ------------------------------------------------------------------ unggah
export interface UploadInput {
  fields: UploadAssetFields;
  file: { data: Buffer };
}

function assertUploadSource(src: SourceRow | undefined): SourceRow {
  if (!src) throw notFound();
  if (!src.mayStoreCopy) {
    throw new ApiError('SOURCE_NOT_STORABLE', { status: 409, message: 'Sumber ini hanya boleh ditautkan, bukan disimpan.' });
  }
  return src;
}

const duplicateAsset = (id: string) =>
  new ApiError('DUPLICATE_ASSET', {
    status: 409,
    message: 'Berkas identik sudah pernah diunggah.',
    details: [{ path: 'file', code: 'duplicate_of', message: id }],
  });

export async function uploadAsset(actorId: string, input: UploadInput, ipHash: string | null, storage: StorageDriver = getStorage()) {
  const { fields } = input;
  const db = getDb();
  if (input.file.data.length > uploadLimitBytes(fields.kind)) throw new ApiError('PAYLOAD_TOO_LARGE');
  const [src] = await db.select().from(contentSources).where(eq(contentSources.id, fields.source_id));
  assertUploadSource(src);
  if (fields.asset_code) {
    const [dup] = await db.select({ id: contentAssets.id }).from(contentAssets).where(eq(contentAssets.assetCode, fields.asset_code));
    if (dup) throw new ApiError('ASSET_CODE_TAKEN', { status: 409, message: 'asset_code sudah dipakai.' });
  }

  const v = await validateAssetBytes(input.file.data, fields.kind, 'file');
  if (!v.ok) {
    const e = v.errors[0]!;
    switch (e.code) {
      case 'unsupported_file_type':
        throw new ApiError('UNSUPPORTED_FILE_TYPE', { status: 415, message: 'Jenis berkas tidak didukung.' });
      case 'macro_not_allowed':
        throw new ApiError('MACRO_NOT_ALLOWED', { status: 415, message: 'Dokumen bermakro tidak diizinkan.' });
      default:
        throw validationError('file', e.code, e.message);
    }
  }
  const a = v.asset;
  const [existing] = await db.select({ id: contentAssets.id }).from(contentAssets).where(eq(contentAssets.sha256, a.sha256));
  if (existing) throw duplicateAsset(existing.id);

  const key = await storage.put(a.data, a.ext, KIND_DIR[fields.kind]);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contentAssets)
        .values({
          assetCode: fields.asset_code ?? null,
          kind: fields.kind,
          title: fields.title,
          sourceId: fields.source_id,
          rightsStatus: 'UNVERIFIED',
          storageBackend: storage.backend,
          storageKey: key,
          mimeType: a.mime,
          sizeBytes: a.size,
          sha256: a.sha256,
          durationSec: a.durationSec,
          attributionText: fields.attribution_text ?? null,
          createdBy: actorId,
        })
        .returning({ id: contentAssets.id });
      await writeAudit(tx, {
        actorUserId: actorId,
        action: 'ASSET_UPLOADED',
        entityType: 'content_asset',
        entityId: row!.id,
        metadata: { asset_id: row!.id, kind: fields.kind, size_bytes: a.size, source_id: fields.source_id },
        ipHash,
      });
      return (await loadAssetDto(tx, row!.id))!;
    });
  } catch (e) {
    await storage.remove(key).catch((err) => logger.warn({ err: String(err) }, 'asset_cleanup_failed'));
    const c = uniqueViolation(e);
    if (c !== null) {
      if (c.includes('sha256')) {
        const [dup] = await db.select({ id: contentAssets.id }).from(contentAssets).where(eq(contentAssets.sha256, a.sha256));
        throw duplicateAsset(dup?.id ?? '');
      }
      if (c.includes('asset_code')) throw new ApiError('ASSET_CODE_TAKEN', { status: 409, message: 'asset_code sudah dipakai.' });
    }
    throw e;
  }
}

// ------------------------------------------------------------------ eksternal
/** Id video dari URL YouTube yang host-nya sudah diizinkan; null bila tak terbaca. */
export function youtubeIdOf(u: URL): string | null {
  const host = u.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (u.pathname === '/watch') id = u.searchParams.get('v');
  else {
    const m = /^\/(?:embed|shorts|live)\/([^/]+)/.exec(u.pathname);
    id = m?.[1] ?? null;
  }
  return id && VIDEO_ID_RE.test(id) ? id : null;
}

export async function createExternalAsset(actorId: string, body: CreateExternalAssetBody, ipHash: string | null) {
  let url: URL;
  try {
    url = new URL(body.external_url);
  } catch {
    throw validationError('external_url', 'invalid_url');
  }
  if (url.username || url.password) throw validationError('external_url', 'invalid_url');
  if (body.kind === 'VIDEO_EMBED') {
    if (!YT_HOSTS.has(url.hostname.toLowerCase())) throw validationError('external_url', 'host_not_allowed', 'Host URL tidak diizinkan untuk video.');
    if (body.external_ref === undefined) throw validationError('external_ref', 'external_ref_required');
    if (!VIDEO_ID_RE.test(body.external_ref) || youtubeIdOf(url) !== body.external_ref) {
      throw validationError('external_ref', 'ref_mismatch', 'external_ref tidak cocok dengan id video pada URL.');
    }
  } else if (body.external_ref !== undefined) {
    throw validationError('external_ref', 'external_ref_not_allowed');
  }

  return getDb().transaction(async (tx) => {
    const [src] = await tx.select({ id: contentSources.id }).from(contentSources).where(eq(contentSources.id, body.source_id));
    if (!src) throw notFound();
    if (body.kind === 'VIDEO_EMBED') {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'asset-ext:' + body.external_ref}))`);
      const [dup] = await tx
        .select({ id: contentAssets.id })
        .from(contentAssets)
        .where(and(eq(contentAssets.kind, 'VIDEO_EMBED'), eq(contentAssets.externalRef, body.external_ref!)));
      if (dup) {
        throw new ApiError('ASSET_ALREADY_EXISTS', {
          status: 409,
          message: 'Video ini sudah terdaftar.',
          details: [{ path: 'external_ref', code: 'duplicate_of', message: dup.id }],
        });
      }
    }
    const [row] = await tx
      .insert(contentAssets)
      .values({
        kind: body.kind,
        title: body.title,
        sourceId: body.source_id,
        rightsStatus: body.kind === 'VIDEO_EMBED' ? 'UNVERIFIED' : 'LINK_ONLY',
        storageBackend: 'EXTERNAL',
        storageKey: null,
        externalUrl: body.external_url,
        externalRef: body.kind === 'VIDEO_EMBED' ? body.external_ref! : null,
        attributionText: body.attribution_text ?? null,
        createdBy: actorId,
      })
      .returning({ id: contentAssets.id });
    await writeAudit(tx, {
      actorUserId: actorId,
      action: 'ASSET_EXTERNAL_CREATED',
      entityType: 'content_asset',
      entityId: row!.id,
      metadata: { asset_id: row!.id, kind: body.kind, source_id: body.source_id },
      ipHash,
    });
    return (await loadAssetDto(tx, row!.id))!;
  });
}

// ------------------------------------------------------------------ daftar & detail
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function listAssets(q: AssetListQuery) {
  const db = getDb();
  const conds: SQL[] = [];
  if (q.kind) conds.push(eq(contentAssets.kind, q.kind));
  if (q.rights_status) conds.push(eq(contentAssets.rightsStatus, q.rights_status));
  if (q.source_id) conds.push(eq(contentAssets.sourceId, q.source_id));
  if (q.q) {
    const pat = `%${escapeLike(q.q)}%`;
    conds.push(or(sql`${contentAssets.title} ILIKE ${pat} ESCAPE '\\'`, sql`${contentAssets.assetCode} ILIKE ${pat} ESCAPE '\\'`)!);
  }
  if (q.referenced !== undefined) conds.push(q.referenced ? sql`${referenceCountSql} > 0` : sql`${referenceCountSql} = 0`);
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(contentAssets).where(where);
  const rows = await db
    .select({ ...assetSelect, refs: referenceCountSql })
    .from(contentAssets)
    .innerJoin(contentSources, eq(contentSources.id, contentAssets.sourceId))
    .leftJoin(verifier, eq(verifier.id, contentAssets.licenseVerifiedBy))
    .where(where)
    .orderBy(desc(contentAssets.createdAt), desc(contentAssets.id))
    .limit(q.page_size)
    .offset((q.page - 1) * q.page_size);
  return { total: Number(total), rows: rows.map((r) => ({ ...assetDto(r), reference_count: Number(r.refs) })) };
}

export async function getAsset(id: string) {
  const db = getDb();
  const dto = await loadAssetDto(db, id);
  if (!dto) throw notFound();
  return { ...dto, referenced_by: await referencesOf(db, id) };
}

// ------------------------------------------------------------------ verifikasi lisensi
export async function updateAsset(actorId: string, id: string, body: UpdateAssetBody, ipHash: string | null) {
  return getDb().transaction(async (tx) => {
    const [cur] = await tx.select().from(contentAssets).where(eq(contentAssets.id, id)).for('update');
    if (!cur) throw notFound();
    const [src] = await tx.select().from(contentSources).where(eq(contentSources.id, cur.sourceId));
    const set: Partial<typeof contentAssets.$inferInsert> = { updatedAt: new Date() };
    if (body.title !== undefined) set.title = body.title;
    if (body.attribution_text !== undefined) set.attributionText = body.attribution_text === null || body.attribution_text.trim() === '' ? null : body.attribution_text;

    const target = body.rights_status;
    let audit: { from: string; to: string } | null = null;
    if (target !== undefined && target !== cur.rightsStatus) {
      if (!ALLOWED_RIGHTS_BY_KIND[cur.kind as AssetKindValue].includes(target)) {
        throw validationError('rights_status', 'rights_status_invalid_for_kind', 'Status hak tidak diizinkan untuk jenis aset ini.');
      }
      if (target === 'OWN_ORIGINAL' && src!.licenseType !== 'OWN') {
        throw new ApiError('RIGHTS_SOURCE_MISMATCH', { status: 409, message: 'Status hak tidak cocok dengan lisensi sumber.' });
      }
      if (target === 'VERIFIED_OPEN') {
        if (!OPEN_LICENSES.includes(src!.licenseType)) {
          throw new ApiError('RIGHTS_SOURCE_MISMATCH', { status: 409, message: 'Status hak tidak cocok dengan lisensi sumber.' });
        }
        const attribution = body.attribution_text !== undefined ? body.attribution_text : cur.attributionText;
        if ((src!.shareAlike || src!.licenseType.startsWith('CC_BY')) && (attribution ?? '').trim() === '') {
          throw new ApiError('ATTRIBUTION_REQUIRED', { status: 409, message: 'Atribusi wajib diisi untuk lisensi ini.' });
        }
      }
      if (target === 'UNVERIFIED' && (await referencesOf(tx, id)).some((r) => r.status === 'PUBLISHED')) {
        throw new ApiError('ASSET_IN_PUBLISHED_USE', { status: 409, message: 'Aset dirujuk konten yang sudah terpublikasi.' });
      }
      set.rightsStatus = target;
      set.licenseVerifiedAt = target === 'UNVERIFIED' ? null : new Date();
      set.licenseVerifiedBy = target === 'UNVERIFIED' ? null : actorId;
      audit = { from: cur.rightsStatus, to: target };
    }
    await tx.update(contentAssets).set(set).where(eq(contentAssets.id, id));
    if (audit) {
      await writeAudit(tx, {
        actorUserId: actorId,
        action: 'LICENSE_STATUS_CHANGED',
        entityType: 'content_asset',
        entityId: id,
        metadata: { asset_id: id, from: audit.from, to: audit.to },
        ipHash,
      });
    }
    return (await loadAssetDto(tx, id))!;
  });
}

// ------------------------------------------------------------------ hapus
export async function deleteAsset(actorId: string, id: string, ipHash: string | null, storage: StorageDriver = getStorage()) {
  const key = await getDb().transaction(async (tx: Tx) => {
    const [cur] = await tx.select().from(contentAssets).where(eq(contentAssets.id, id)).for('update');
    if (!cur) throw notFound();
    if ((await referencesOf(tx, id)).length > 0) throw new ApiError('ASSET_IN_USE', { status: 409, message: 'Aset masih dirujuk konten.' });
    try {
      await tx.delete(contentAssets).where(eq(contentAssets.id, id));
    } catch (e) {
      if (fkViolation(e)) throw new ApiError('ASSET_IN_USE', { status: 409, message: 'Aset masih dirujuk konten.' });
      throw e;
    }
    await writeAudit(tx, {
      actorUserId: actorId,
      action: 'ASSET_DELETED',
      entityType: 'content_asset',
      entityId: id,
      metadata: { asset_id: id, kind: cur.kind, asset_code: cur.assetCode },
      ipHash,
    });
    return cur.storageKey;
  });
  if (key) await storage.remove(key).catch((err) => logger.warn({ err: String(err), assetId: id }, 'asset_file_remove_failed'));
}

// ------------------------------------------------------------------ pratinjau berkas (admin)
function parseRange(header: string, size: number): { start: number; end: number } | 'invalid' {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start: number;
  let end: number;
  if (m[1] === '') {
    const n = Number(m[2]);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start > end || start >= size ? 'invalid' : { start, end };
}

export async function serveAdminAssetFile(id: string, rangeHeader: string | null, storage: StorageDriver = getStorage()): Promise<Response> {
  const [a] = await getDb().select().from(contentAssets).where(eq(contentAssets.id, id));
  if (!a || a.storageBackend === 'EXTERNAL' || !a.storageKey || !a.mimeType) throw notFound();
  let data: Buffer;
  try {
    data = await storage.get(a.storageKey);
  } catch {
    logger.error({ assetId: id }, 'asset_file_missing');
    throw notFound();
  }
  const headers: Record<string, string> = {
    'Content-Type': a.mimeType,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Content-Disposition': a.kind === 'DOCUMENT' ? 'attachment' : 'inline',
    ETag: `"${a.sha256 ?? createHash('sha256').update(data).digest('hex')}"`,
  };
  if (a.kind === 'AUDIO_LISTENING') headers['Accept-Ranges'] = 'bytes';
  if (a.kind === 'AUDIO_LISTENING' && rangeHeader) {
    const r = parseRange(rangeHeader, data.length);
    if (r === 'invalid') return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${data.length}` } });
    const part = data.subarray(r.start, r.end + 1);
    return new Response(new Uint8Array(part), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${r.start}-${r.end}/${data.length}`, 'Content-Length': String(part.length) },
    });
  }
  return new Response(new Uint8Array(data), { status: 200, headers: { ...headers, 'Content-Length': String(data.length) } });
}

// ------------------------------------------------------------------ ringkasan lisensi
export async function licenseSummary() {
  const db = getDb();
  const byStatus: Record<string, number> = { UNVERIFIED: 0, VERIFIED_OPEN: 0, OWN_ORIGINAL: 0, EMBED_ONLY: 0, LINK_ONLY: 0 };
  const grouped = await db.select({ s: contentAssets.rightsStatus, n: count() }).from(contentAssets).groupBy(contentAssets.rightsStatus);
  for (const g of grouped) byStatus[g.s] = Number(g.n);
  const blockers = await db.execute(sql`SELECT count(*)::int AS n FROM v_publish_blockers WHERE reason_code = 'ASSET_UNVERIFIED'`);
  const flagged = await db.execute(sql`
    SELECT s.code, s.non_commercial_only AS nc, s.share_alike AS sa
    FROM content_sources s
    WHERE (s.non_commercial_only OR s.share_alike) AND EXISTS (SELECT 1 FROM content_assets a WHERE a.source_id = s.id)
    ORDER BY s.code`);
  const rows = flagged.rows as Array<{ code: string; nc: boolean; sa: boolean }>;
  return {
    assets_by_rights_status: byStatus,
    publish_blockers: Number((blockers.rows[0] as { n: number }).n),
    non_commercial_sources_in_use: rows.filter((r) => r.nc).map((r) => r.code),
    share_alike_sources_in_use: rows.filter((r) => r.sa).map((r) => r.code),
  };
}

