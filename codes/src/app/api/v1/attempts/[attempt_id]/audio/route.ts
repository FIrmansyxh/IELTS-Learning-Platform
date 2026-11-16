import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { assessmentSets, attemptSections, attempts, contentAssets } from '@/db/schema';
import { Uuid } from '@/contracts/common';
import { getDb } from '@/server/db';
import { ApiError, notFound } from '@/server/http/errors';
import { withApi } from '@/server/http/withApi';
import { logger } from '@/server/logger';
import { getStorage } from '@/server/storage';
import { AttemptIdParamSchema } from '@/server/attempts/schemas';
import { parseByteRange } from '@/lib/audio/range';
import { mockStateOf } from '@/server/simulation/state';

export const dynamic = 'force-dynamic';

const AudioStreamQuerySchema = z.object({
  section: Uuid.optional(),
  // Simulasi (MOCK_TEST): content_assets.id audio bagian Listening yang diminta.
  asset: Uuid.optional(),
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

    let listeningAssetId: string | null;
    if (attempt.assessmentType === 'MOCK_TEST') {
      // 3a. Simulasi (tanpa set): audio per bagian dipilih lewat `?asset=`, wajib termasuk bagian Listening
      // attempt ini, dan section Listening sedang dikerjakan (sudah dimulai, belum dikumpulkan).
      if (!query.asset) throw notFound();
      const listening = mockStateOf(attempt).sections.find((s) => s.section === 'LISTENING');
      if (!listening?.parts.some((p) => p.listening_asset_id === query.asset)) throw notFound();
      const [secRow] = await db
        .select()
        .from(attemptSections)
        .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.skill, 'LISTENING')))
        .limit(1);
      if (!secRow?.startedAt || secRow.submittedAt) throw new ApiError('ATTEMPT_NOT_ACTIVE');
      listeningAssetId = query.asset;
    } else {
      // 3. Muat assessment set (attempt tanpa set, mis. MIX_PRACTICE, tidak punya audio ujian)
      if (!attempt.assessmentSetId) throw notFound();
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
      listeningAssetId = targetSet.listeningAssetId;
    }

    // 5. Muat asset audio
    if (!listeningAssetId) throw notFound();

    const [asset] = await db
      .select()
      .from(contentAssets)
      .where(eq(contentAssets.id, listeningAssetId))
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
