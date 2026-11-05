import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { assessmentSets, attempts, contentAssets } from '@/db/schema';
import { Uuid } from '@/contracts/common';
import { getDb } from '@/server/db';
import { ApiError, notFound } from '@/server/http/errors';
import { withApi } from '@/server/http/withApi';
import { logger } from '@/server/logger';
import { getStorage } from '@/server/storage';
import { AttemptIdParamSchema } from '@/server/attempts/schemas';
import { parseByteRange } from '@/lib/audio/range';

export const dynamic = 'force-dynamic';

const AudioStreamQuerySchema = z.object({
  section: Uuid.optional(),
});

const ALLOWED_MIME_TYPES = new Set(['audio/mpeg', 'audio/ogg', 'audio/wav']);

export const GET = withApi(
  {
    auth: 'user',
    params: AttemptIdParamSchema,
    query: AudioStreamQuerySchema,
  },
  async ({ req, user, params, query }) => {
    const db = getDb();

    // 1. Otorisasi attempt: harus milik user
    const [attempt] = await db
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, params.attempt_id), eq(attempts.userId, user!.id)))
      .limit(1);

    if (!attempt) throw notFound(); // Bukan milik user -> 404 (bukan 403)

    // 2. Status attempt harus IN_PROGRESS
    if (attempt.status !== 'IN_PROGRESS') {
      throw new ApiError('ATTEMPT_NOT_ACTIVE'); // 409
    }

    // 3. Muat assessment set
    const [set] = await db
      .select()
      .from(assessmentSets)
      .where(eq(assessmentSets.id, attempt.assessmentSetId))
      .limit(1);

    if (!set) throw notFound();

    // 4. Penanganan attempt TIER_BOSS_EXAM
    let targetSet = set;
    if (set.assessmentType === 'TIER_BOSS_EXAM') {
      if (!query.section) throw notFound(); // Boss attempt tanpa section -> 404
      const [childSet] = await db
        .select()
        .from(assessmentSets)
        .where(and(eq(assessmentSets.id, query.section), eq(assessmentSets.parentSetId, set.id)))
        .limit(1);
      if (!childSet) throw notFound();

      // Periksa apakah section berstatus ACTIVE
      const state = attempt.state as { sections?: Record<string, { status?: string; phase?: string }> } | null;
      const secState = state?.sections?.[query.section];
      if (!secState || (secState.phase !== 'ACTIVE' && secState.status !== 'ACTIVE')) {
        throw new ApiError('ATTEMPT_NOT_ACTIVE');
      }
      targetSet = childSet;
    }

    // 5. Muat asset audio
    if (!targetSet.listeningAssetId) throw notFound();

    const [asset] = await db
      .select()
      .from(contentAssets)
      .where(eq(contentAssets.id, targetSet.listeningAssetId))
      .limit(1);

    if (!asset || asset.kind !== 'AUDIO_LISTENING' || !asset.storageKey) {
      throw notFound();
    }

    // 6. Periksa berkas fisik pada storage driver
    const storage = getStorage();
    const fileStat = await storage.stat(asset.storageKey);
    if (!fileStat) {
      // Log error tanpa path berkas sesuai SPEC-011
      logger.error({ msg: 'asset_file_missing', asset_id: asset.id });
      throw notFound();
    }

    // 7. Parsing Range header
    const rangeHeader = req.headers.get('range');
    const range = parseByteRange(rangeHeader, fileStat.size);
    if (range.type === 'invalid') {
      throw new ApiError('RANGE_NOT_SATISFIABLE', {
        headers: {
          'Content-Range': `bytes */${fileStat.size}`,
        },
      });
    }

    // 8. Siapkan aliran data & header respons wajib
    const mimeType = asset.mimeType && ALLOWED_MIME_TYPES.has(asset.mimeType) ? asset.mimeType : 'audio/mpeg';
    const isPartial = range.type === 'partial';
    const start = isPartial ? range.start : 0;
    const end = isPartial ? range.end : fileStat.size - 1;
    const contentLength = end - start + 1;

    const stream = await storage.readStream(asset.storageKey, isPartial ? { start, end } : undefined);

    const headers = new Headers({
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(contentLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });

    if (isPartial) {
      headers.set('Content-Range', `bytes ${start}-${end}/${fileStat.size}`);
    }

    return new Response(stream, {
      status: isPartial ? 206 : 200,
      headers,
    });
  },
);
