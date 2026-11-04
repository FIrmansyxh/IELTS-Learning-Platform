/**
 * GET /attempts/{attempt_id}/audio (SPEC-011). Audio Listening hanya dilayani lewat attempt milik pengguna yang
 * `IN_PROGRESS` dan belum lewat deadline; tidak ada URL permanen (rujukan = attempt_id, bukan asset_id), tidak ada
 * unduhan, tidak ada cache. Berkas dialirkan dari StorageDriver dengan dukungan `Range` tunggal tanpa memuat seluruh berkas.
 *
 * Catatan keamanan (spec 011 Non-Goals; security-standards 6.3.7 / 17.6): penguncian rewind/ulang pada mode EXAM adalah
 * kontrol UX klien. Yang ditegakkan SERVER: kepemilikan, status aktif + deadline (audio berhenti dilayani setelah
 * submit/expire), pembatasan section Boss `ACTIVE`, dan tidak adanya akses via asset_id.
 */
import { and, eq } from 'drizzle-orm';
import { assessmentSets, attempts, contentAssets } from '@/db/schema';
import type { Db } from '../db';
import { nowDate } from '../clock';
import { ApiError, notFound } from '../http/errors';
import { logger } from '../logger';
import { getStorage, type StorageDriver } from '../storage';
import { acquireAudioSlot, releaseOnEnd } from './audio-limits';
import { servedAudioMime } from './audio-asset';
import { parseAudioRange } from './audio-range';
import { consume } from '../http/rate-limit';
import { GRACE_MS, isExpired } from './dto';

const BASE_HEADERS = {
  'Accept-Ranges': 'bytes',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Disposition': 'inline',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export async function serveAttemptAudio(
  db: Db,
  userId: string,
  attemptId: string,
  section: string | undefined,
  rangeHeader: string | null,
  storage: StorageDriver = getStorage(),
): Promise<Response> {
  const now = nowDate();
  const [attempt] = await db.select().from(attempts).where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId))).limit(1);
  if (!attempt) throw notFound(); // bukan milik pengguna = tidak ada (bukan 403)
  if (attempt.status !== 'IN_PROGRESS' || isExpired(attempt, now)) throw new ApiError('ATTEMPT_NOT_ACTIVE');
  const [set] = await db.select().from(assessmentSets).where(eq(assessmentSets.id, attempt.assessmentSetId)).limit(1);
  if (!set) throw notFound();

  let assetId = set.listeningAssetId;
  if (set.assessmentType === 'TIER_BOSS_EXAM') {
    // SPEC-014: audio milik section anak; hanya saat section ACTIVE. Tanpa `section` -> 404.
    if (!section) throw notFound();
    const [child] = await db
      .select({ listeningAssetId: assessmentSets.listeningAssetId })
      .from(assessmentSets)
      .where(and(eq(assessmentSets.id, section), eq(assessmentSets.parentSetId, set.id)))
      .limit(1);
    if (!child) throw notFound();
    const sections = (attempt.state as { sections?: Record<string, { phase?: string; deadline_at?: string | null }> }).sections;
    const st = sections?.[section];
    if (st?.phase !== 'ACTIVE') throw new ApiError('ATTEMPT_NOT_ACTIVE');
    // Section yang sudah lewat batas waktu (+5 s) tidak lagi dilayani audionya.
    if (st.deadline_at && now.getTime() > Date.parse(st.deadline_at) + GRACE_MS) throw new ApiError('ATTEMPT_NOT_ACTIVE');
    assetId = child.listeningAssetId;
  }
  if (!assetId) throw notFound();

  const [asset] = await db
    .select({ kind: contentAssets.kind, mimeType: contentAssets.mimeType, storageKey: contentAssets.storageKey, storageBackend: contentAssets.storageBackend })
    .from(contentAssets)
    .where(eq(contentAssets.id, assetId))
    .limit(1);
  const mime = servedAudioMime(asset);
  if (!asset || !asset.storageKey || !mime) throw notFound();

  let total: number;
  try {
    total = await storage.size(asset.storageKey);
  } catch {
    logger.error({ assetId }, 'asset_file_missing'); // tanpa path storage
    throw notFound();
  }

  const range = parseAudioRange(rangeHeader, total);
  if (range.kind === 'invalid') {
    throw new ApiError('RANGE_NOT_SATISFIABLE', { headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' } });
  }
  // F-11-02: aliran serentak per pengguna dibatasi; permintaan penuh (tanpa Range) dibatasi per attempt.
  if (range.kind === 'full' && total > 0) {
    const wait = consume('audio_full', attemptId);
    if (wait !== null) throw new ApiError('RATE_LIMITED', { headers: { 'Retry-After': String(wait) } });
  }
  const headers: Record<string, string> = { ...BASE_HEADERS, 'Content-Type': mime };
  if (range.kind === 'range') {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${total}`;
    headers['Content-Length'] = String(range.end - range.start + 1);
    const release = acquireAudioSlot(userId);
    return new Response(releaseOnEnd(storage.openRange(asset.storageKey, range.start, range.end), release), { status: 206, headers });
  }
  headers['Content-Length'] = String(total);
  if (total === 0) return new Response(null, { status: 200, headers });
  const release = acquireAudioSlot(userId);
  return new Response(releaseOnEnd(storage.openRange(asset.storageKey, 0, total - 1), release), { status: 200, headers });
}
