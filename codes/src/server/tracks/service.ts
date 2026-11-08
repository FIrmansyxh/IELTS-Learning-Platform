import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  learningMaterials,
  learningTrackItems,
  learningTracks,
  subModules,
  userSubModuleStyles,
  users,
} from '@/db/schema';
import type { Delivery, TrackSummary } from '@/contracts/tracks';
import { getDb, type DbOrTx } from '../db';
import { notFound } from '../http/errors';
import { getCompletedSubModuleIds, recomputeStatuses } from '../gatekeeping/service';
import { activeExamModule } from '../gatekeeping/exam-module';

export async function getTracks(userId: string, db: DbOrTx = getDb()): Promise<TrackSummary[]> {
  const [userRow] = await db
    .select({ activeTrackId: users.activeTrackId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const tracks = await db
    .select()
    .from(learningTracks)
    .where(eq(learningTracks.status, 'PUBLISHED'))
    .orderBy(asc(learningTracks.sortOrder));

  // AC-17: bila active_track_id null atau tidak published, GT-STRUCT adalah jalur aktif
  let activeTrackId = userRow?.activeTrackId ?? null;
  if (!activeTrackId || !tracks.some((t) => t.id === activeTrackId)) {
    activeTrackId = tracks.find((t) => t.code === 'GT-STRUCT')?.id ?? null;
  }

  // Ambil sub_module_id yang sudah selesai/dilewati oleh pengguna
  const completedSubIdSet = await getCompletedSubModuleIds(db, userId);

  // Termasuk COMING_SOON untuk total_sub_modules per AC-1
  const allGtSubModules = await db
    .select({ id: subModules.id })
    .from(subModules)
    .where(inArray(subModules.examModule, ['COMMON', activeExamModule()]));
  const structTotal = allGtSubModules.length; // 31
  const structCompleted = allGtSubModules.filter((s) => completedSubIdSet.has(s.id)).length;

  const result: TrackSummary[] = [];

  for (const t of tracks) {
    if (t.kind === 'CURRICULUM') {
      result.push({
        code: t.code,
        title: t.title,
        description: t.description,
        kind: t.kind,
        layout: t.layout as 'LIST' | 'SPRINT',
        delivery_style_default: t.deliveryStyleDefault as 'LEARN_FIRST' | 'PRACTICE_FIRST' | 'CASE_BASED',
        target_band_min: t.targetBandMin,
        target_band_max: t.targetBandMax,
        recommended_for: t.recommendedFor,
        total_sub_modules: structTotal,
        completed_sub_modules: structCompleted,
        checkpoint_count: 0,
        is_active: t.id === activeTrackId,
      });
    } else {
      const items = await db
        .select({
          itemKind: learningTrackItems.itemKind,
          subModuleId: learningTrackItems.subModuleId,
        })
        .from(learningTrackItems)
        .where(eq(learningTrackItems.trackId, t.id));

      const subModuleItems = items.filter((it) => it.itemKind === 'SUB_MODULE');
      const checkpointCount = items.filter((it) => it.itemKind === 'CHECKPOINT').length;
      const completedCount = subModuleItems.filter(
        (it) => it.subModuleId && completedSubIdSet.has(it.subModuleId),
      ).length;

      result.push({
        code: t.code,
        title: t.title,
        description: t.description,
        kind: t.kind,
        layout: t.layout as 'LIST' | 'SPRINT',
        delivery_style_default: t.deliveryStyleDefault as 'LEARN_FIRST' | 'PRACTICE_FIRST' | 'CASE_BASED',
        target_band_min: t.targetBandMin,
        target_band_max: t.targetBandMax,
        recommended_for: t.recommendedFor,
        total_sub_modules: subModuleItems.length,
        completed_sub_modules: completedCount,
        checkpoint_count: checkpointCount,
        is_active: t.id === activeTrackId,
      });
    }
  }

  return result;
}

export async function setActiveTrack(userId: string, trackCode: string, db: DbOrTx = getDb()): Promise<void> {
  const [track] = await db
    .select({ id: learningTracks.id })
    .from(learningTracks)
    .where(and(eq(learningTracks.code, trackCode), eq(learningTracks.status, 'PUBLISHED')))
    .limit(1);

  if (!track) throw notFound();

  await db
    .update(users)
    .set({ activeTrackId: track.id, updatedAt: new Date() })
    .where(eq(users.id, userId));

  await recomputeStatuses(db, userId);
}

export async function getDelivery(
  userId: string,
  subModuleId: string,
  requestedQueryStyle?: string,
  db: DbOrTx = getDb(),
): Promise<Delivery> {
  const materials = await db
    .select({ style: learningMaterials.style })
    .from(learningMaterials)
    .where(eq(learningMaterials.subModuleId, subModuleId));

  const availableStyles: Array<'LEARN_FIRST' | 'PRACTICE_FIRST' | 'CASE_BASED'> = ['LEARN_FIRST'];
  for (const m of materials) {
    if (m.style === 'PRACTICE_FIRST' || m.style === 'CASE_BASED') {
      if (!availableStyles.includes(m.style)) availableStyles.push(m.style);
    }
  }

  let requested: 'LEARN_FIRST' | 'PRACTICE_FIRST' | 'CASE_BASED';
  let source: 'QUERY' | 'USER_OVERRIDE' | 'TRACK_DEFAULT';

  if (requestedQueryStyle) {
    requested = requestedQueryStyle as 'LEARN_FIRST' | 'PRACTICE_FIRST' | 'CASE_BASED';
    source = 'QUERY';
  } else {
    const [override] = await db
      .select({ style: userSubModuleStyles.style })
      .from(userSubModuleStyles)
      .where(
        and(
          eq(userSubModuleStyles.userId, userId),
          eq(userSubModuleStyles.subModuleId, subModuleId),
        ),
      )
      .limit(1);

    if (override) {
      requested = override.style;
      source = 'USER_OVERRIDE';
    } else {
      source = 'TRACK_DEFAULT';
      const [u] = await db
        .select({ activeTrackId: users.activeTrackId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (u?.activeTrackId) {
        const [tr] = await db
          .select({ defaultStyle: learningTracks.deliveryStyleDefault })
          .from(learningTracks)
          .where(eq(learningTracks.id, u.activeTrackId))
          .limit(1);
        requested = (tr?.defaultStyle as 'LEARN_FIRST' | 'PRACTICE_FIRST' | 'CASE_BASED') ?? 'LEARN_FIRST';
      } else {
        requested = 'LEARN_FIRST';
      }
    }
  }

  let applied: 'LEARN_FIRST' | 'PRACTICE_FIRST' | 'CASE_BASED';
  if (requested === 'LEARN_FIRST' || availableStyles.includes(requested)) {
    applied = requested;
  } else {
    applied = 'LEARN_FIRST';
  }

  return {
    requested_style: requested,
    applied_style: applied,
    source,
    available_styles: availableStyles,
  };
}

export async function setSubModuleStyle(
  userId: string,
  subModuleId: string,
  style: 'LEARN_FIRST' | 'PRACTICE_FIRST' | 'CASE_BASED' | null,
  db: DbOrTx = getDb(),
): Promise<void> {
  if (style === null) {
    await db
      .delete(userSubModuleStyles)
      .where(
        and(
          eq(userSubModuleStyles.userId, userId),
          eq(userSubModuleStyles.subModuleId, subModuleId),
        ),
      );
  } else {
    await db
      .insert(userSubModuleStyles)
      .values({
        userId,
        subModuleId,
        style,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userSubModuleStyles.userId, userSubModuleStyles.subModuleId],
        set: { style, updatedAt: new Date() },
      });
  }
}

export async function getSubModuleMaterials(
  subModuleId: string,
  appliedStyle: 'LEARN_FIRST' | 'PRACTICE_FIRST' | 'CASE_BASED',
  db: DbOrTx = getDb(),
) {
  const [base] = await db
    .select()
    .from(learningMaterials)
    .where(and(eq(learningMaterials.subModuleId, subModuleId), eq(learningMaterials.style, 'BASE')))
    .limit(1);

  if (!base) return null;

  if (appliedStyle === 'LEARN_FIRST') {
    return base;
  }

  const [variant] = await db
    .select()
    .from(learningMaterials)
    .where(and(eq(learningMaterials.subModuleId, subModuleId), eq(learningMaterials.style, appliedStyle)))
    .limit(1);

  if (!variant) return base;

  // Mewarisi bagian yang kosong dari materi bawaan (D3)
  const variantVideos = Array.isArray(variant.videosJson) && variant.videosJson.length > 0 ? variant.videosJson : base.videosJson;
  const variantSlides = Array.isArray(variant.slidesJson) && variant.slidesJson.length > 0 ? variant.slidesJson : base.slidesJson;
  const variantAttachments = Array.isArray(variant.attachmentsJson) && variant.attachmentsJson.length > 0 ? variant.attachmentsJson : base.attachmentsJson;
  const variantMiniTask = variant.miniTaskJson && Object.keys(variant.miniTaskJson).length > 0 ? variant.miniTaskJson : base.miniTaskJson;

  return {
    ...base,
    articleMarkdown: variant.articleMarkdown,
    videosJson: variantVideos,
    slidesJson: variantSlides,
    attachmentsJson: variantAttachments,
    miniTaskJson: variantMiniTask,
    origin: variant.origin,
    sourceId: variant.sourceId ?? base.sourceId,
    attributionText: variant.attributionText ?? base.attributionText,
  };
}
