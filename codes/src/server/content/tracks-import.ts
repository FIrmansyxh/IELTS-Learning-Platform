import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { learningTrackItems, learningTracks, subModules } from '@/db/schema';
import type { LearningTrackContentType } from '@/contracts/content';
import type { Tx } from '../db';
import { canonicalJson, sha256Hex } from './validate';
import { ContentApplyError } from './apply';

export interface ApplyTracksResult {
  created: number;
  updated: number;
  noop: number;
}

export async function applyTracks(
  tx: Tx,
  tracks: LearningTrackContentType[],
  status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED',
): Promise<ApplyTracksResult> {
  let created = 0;
  let updated = 0;
  let noop = 0;

  const subRows = await tx.select({ id: subModules.id, code: subModules.subModuleCode }).from(subModules);
  const subMap = new Map(subRows.map((s) => [s.code, s.id]));

  for (const tr of tracks) {
    const hash = sha256Hex(canonicalJson(tr));
    const [existing] = await tx
      .select()
      .from(learningTracks)
      .where(eq(learningTracks.code, tr.track_code))
      .limit(1);

    if (existing && existing.contentHash === hash) {
      noop++;
      continue;
    }

    const now = new Date();
    let trackId: string;

    if (existing) {
      trackId = existing.id;
      await tx
        .update(learningTracks)
        .set({
          title: tr.title,
          description: tr.description,
          kind: tr.kind,
          layout: tr.layout ?? 'LIST',
          deliveryStyleDefault: tr.delivery_style_default,
          targetBandMin: tr.target_band_min,
          targetBandMax: tr.target_band_max,
          recommendedFor: tr.recommended_for,
          sortOrder: tr.sort_order,
          status,
          contentHash: hash,
          updatedAt: now,
        })
        .where(eq(learningTracks.id, trackId));

      await tx.delete(learningTrackItems).where(eq(learningTrackItems.trackId, trackId));
      updated++;
    } else {
      trackId = randomUUID();
      await tx.insert(learningTracks).values({
        id: trackId,
        code: tr.track_code,
        title: tr.title,
        description: tr.description,
        kind: tr.kind,
        layout: tr.layout ?? 'LIST',
        deliveryStyleDefault: tr.delivery_style_default,
        targetBandMin: tr.target_band_min,
        targetBandMax: tr.target_band_max,
        recommendedFor: tr.recommended_for,
        sortOrder: tr.sort_order,
        status,
        contentHash: hash,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    if (tr.kind === 'CURATED' && tr.items && tr.items.length > 0) {
      for (const [idx, item] of tr.items.entries()) {
        let subModuleId: string | null = null;
        if (item.kind === 'SUB_MODULE') {
          subModuleId = subMap.get(item.sub_module_code!) ?? null;
          if (!subModuleId) {
            throw new ContentApplyError(
              'sub_module_not_found',
              `Sub-modul '${item.sub_module_code}' tidak ditemukan di DB.`,
              `learning_tracks.${tr.track_code}.items[${idx}]`,
            );
          }
        }
        await tx.insert(learningTrackItems).values({
          id: randomUUID(),
          trackId,
          itemKind: item.kind,
          subModuleId,
          orderIndex: idx + 1,
          weekNo: item.week_no ?? null,
          dayNo: item.day_no ?? null,
          createdAt: now,
        });
      }
    }
  }

  return { created, updated, noop };
}
