import { eq, sql } from 'drizzle-orm';
import { assessmentSets, contentAssets, contentRevisions, contentSources, learningMaterials, modules, subModules } from '@/db/schema';
import type { SubModuleItemType } from '@/contracts/content';
import type { Tx } from '../db';
import {
  dbSubSnapshot,
  desiredSubSnapshot,
  loadDbState,
  type ContentPlan,
  type DbState,
  type EntityKind,
  type NormalizedSet,
  type PlanItem,
} from './plan';
import { naturalKey } from './validate';

export class ContentApplyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly path = '$',
  ) {
    super(message);
    this.name = 'ContentApplyError';
  }
}

export interface Touched {
  kind: EntityKind;
  id: string;
  code: string;
  setType?: NormalizedSet['type'];
  action: PlanItem['action'];
}
export interface ApplyResult {
  counts: Record<EntityKind, { created: number; updated: number; unchanged: number }>;
  touched: Touched[];
}

export interface ApplyOptions {
  actorUserId: string | null;
}

const bump = (r: ApplyResult, kind: EntityKind, action: PlanItem['action']) => {
  r.counts[kind][action === 'CREATE' ? 'created' : action === 'UPDATE' ? 'updated' : 'unchanged']++;
};

export async function ensureRevision(tx: Tx, type: string, id: string, version: number, snapshot: unknown, o: ApplyOptions) {
  await tx
    .insert(contentRevisions)
    .values({ entityType: type, entityId: id, version, snapshot: snapshot as object, changedBy: o.actorUserId })
    .onConflictDoNothing();
}

/** Revisi modul (modul tidak punya kolom versi): nomor = max+1; snapshot pra-perubahan ditulis bila belum ada revisi. */
async function moduleRevision(tx: Tx, id: string, snap: unknown, o: ApplyOptions, force = false) {
  const [r] = await tx.select({ v: sql<number>`coalesce(max(${contentRevisions.version}), 0)` }).from(contentRevisions).where(sql`${contentRevisions.entityType} = 'MODULE' AND ${contentRevisions.entityId} = ${id}`);
  const n = Number(r?.v ?? 0);
  if (n > 0 && !force) return;
  await tx.insert(contentRevisions).values({ entityType: 'MODULE', entityId: id, version: n + 1, snapshot: snap as object, changedBy: o.actorUserId }).onConflictDoNothing();
}

/**
 * applyContentPlan: tulis semua item rencana dalam transaksi pemanggil. Entitas baru = DRAFT; entitas yang sudah
 * ada mempertahankan statusnya dan `version`/`content_version` naik 1 bila hash berubah (snapshot lama disimpan).
 */
export async function applyContentPlan(tx: Tx, plan: ContentPlan, opts: ApplyOptions): Promise<ApplyResult> {
  const state: DbState = await loadDbState(tx);
  const assetRows = await tx
    .select({ id: contentAssets.id, code: contentAssets.assetCode, ref: contentAssets.externalRef, kind: contentAssets.kind })
    .from(contentAssets);
  const assetIdByCode = new Map(assetRows.filter((a) => a.code).map((a) => [a.code as string, a.id]));
  const videoIdByRef = new Map(assetRows.filter((a) => a.kind === 'VIDEO_EMBED' && a.ref).map((a) => [a.ref as string, a.id]));
  const sources = new Map((await tx.select({ id: contentSources.id, code: contentSources.code }).from(contentSources)).map((s) => [s.code, s.id]));

  const result: ApplyResult = {
    counts: {
      MODULE: { created: 0, updated: 0, unchanged: 0 },
      SUB_MODULE: { created: 0, updated: 0, unchanged: 0 },
      ASSESSMENT_SET: { created: 0, updated: 0, unchanged: 0 },
    },
    touched: [],
  };

  const sourceId = (code?: string) => {
    if (!code) return null;
    const id = sources.get(code);
    if (!id) throw new ContentApplyError('source_not_found', `Sumber '${code}' tidak dikenal.`);
    return id;
  };
  const assetId = (code: string, path: string) => {
    const id = assetIdByCode.get(code);
    if (!id) throw new ContentApplyError('asset_not_found', `Aset '${code}' belum terdaftar.`, path);
    return id;
  };
  const videoAsset = async (v: NonNullable<NonNullable<SubModuleItemType['materials']>['videos']>[number]) => {
    const existing = videoIdByRef.get(v.video_id);
    if (existing) return existing;
    const [row] = await tx
      .insert(contentAssets)
      .values({
        kind: 'VIDEO_EMBED',
        title: v.title,
        sourceId: sourceId('YOUTUBE')!,
        rightsStatus: 'UNVERIFIED',
        storageBackend: 'EXTERNAL',
        externalUrl: `https://www.youtube.com/watch?v=${v.video_id}`,
        externalRef: v.video_id,
        createdBy: opts.actorUserId,
      })
      .returning({ id: contentAssets.id });
    videoIdByRef.set(v.video_id, row!.id);
    return row!.id;
  };

  const tierId = (n: number) => {
    const id = state.tierId.get(n);
    if (!id) throw new ContentApplyError('tier_not_found', `Tier ${n} tidak ada; jalankan db:seed.`);
    return id;
  };
  const moduleId = new Map([...state.modules].map(([c, m]) => [c, m.id]));
  const subId = new Map([...state.subs].map(([c, s]) => [c, s.id]));
  const setIdByKey = new Map([...state.sets].map(([k, s]) => [k, s.id]));

  for (const item of plan.items) {
    if (item.entityKind === 'MODULE') {
      const m = item.data;
      if (item.action === 'CREATE') {
        const [row] = await tx
          .insert(modules)
          .values({ tierId: tierId(m.tier_number), moduleCode: m.module_code, skillCategory: m.module_category, title: m.title, orderIndex: m.order_index!, status: 'DRAFT' })
          .returning({ id: modules.id });
        moduleId.set(m.module_code, row!.id);
        await moduleRevision(tx, row!.id, { title: m.title, skill: m.module_category, order: m.order_index }, opts);
      } else if (item.action === 'UPDATE') {
        const before = state.modules.get(m.module_code);
        if (before) {
          await moduleRevision(tx, before.id, { title: before.title, skill: before.skillCategory, order: before.orderIndex }, opts);
          await moduleRevision(tx, before.id, { title: m.title, skill: m.module_category, order: m.order_index }, opts, true);
        }
        await tx
          .update(modules)
          .set({ title: m.title, skillCategory: m.module_category, orderIndex: m.order_index!, updatedAt: new Date() })
          .where(eq(modules.moduleCode, m.module_code));
      }
      bump(result, 'MODULE', item.action);
      result.touched.push({ kind: 'MODULE', id: moduleId.get(m.module_code)!, code: m.module_code, action: item.action });
      continue;
    }

    if (item.entityKind === 'SUB_MODULE') {
      const s = item.data;
      const mid = moduleId.get(s.module_code);
      if (!mid) throw new ContentApplyError('module_not_found', `Modul '${s.module_code}' belum ada.`, `sub_modules[${s.sub_module_code}].module_code`);
      let id = subId.get(s.sub_module_code);
      const existing = state.subs.get(s.sub_module_code);

      const materialsJson = async () => {
        const m = s.materials!;
        const videos = [];
        for (const v of m.videos ?? []) {
          videos.push({
            asset_id: await videoAsset(v),
            video_id: v.video_id,
            title: v.title,
            instructor_channel: v.instructor_channel ?? null,
            language: v.language,
            start_sec: v.start_sec,
            end_sec: v.end_sec,
          });
        }
        return {
          articleMarkdown: m.article_markdown,
          videosJson: videos,
          slidesJson: (m.slides ?? []).map((x, i) => ({ asset_id: assetId(x.asset_code!, `sub_modules.${s.sub_module_code}.materials.slides[${i}]`), order: x.order, caption: x.caption, alt: x.alt ?? x.caption })),
          attachmentsJson: (m.attachments ?? []).map((a, i) => ({ asset_id: assetId(a.asset_code!, `sub_modules.${s.sub_module_code}.materials.attachments[${i}]`), title: a.title, file_type: a.file_type })),
          miniTaskJson: m.mini_task ?? {},
          origin: s.origin ?? ('ORIGINAL_AUTHORED' as const),
          sourceId: sourceId(s.source_code),
          attributionText: s.attribution_text ?? null,
        };
      };

      if (item.action === 'CREATE') {
        const [row] = await tx
          .insert(subModules)
          .values({ moduleId: mid, subModuleCode: s.sub_module_code, title: s.sub_module_title, passingScorePercent: s.passing_score_percent!, orderIndex: s.order_index!, status: 'DRAFT', contentVersion: 1 })
          .returning({ id: subModules.id });
        id = row!.id;
        subId.set(s.sub_module_code, id);
        if (s.materials) await tx.insert(learningMaterials).values({ subModuleId: id, ...(await materialsJson()), contentVersion: 1 });
        await ensureRevision(tx, 'SUB_MODULE', id, 1, desiredSubSnapshot(s), opts);
      } else if (item.action === 'UPDATE' && existing) {
        id = existing.id;
        await ensureRevision(tx, 'SUB_MODULE', id, existing.contentVersion, dbSubSnapshot(state, existing, true), opts);
        const next = existing.contentVersion + 1;
        await tx
          .update(subModules)
          .set({ title: s.sub_module_title, passingScorePercent: s.passing_score_percent!, orderIndex: s.order_index!, contentVersion: next, updatedAt: new Date() })
          .where(eq(subModules.id, id));
        if (s.materials) {
          const mj = await materialsJson();
          await tx
            .insert(learningMaterials)
            .values({ subModuleId: id, ...mj, contentVersion: next })
            .onConflictDoUpdate({ target: learningMaterials.subModuleId, set: { ...mj, contentVersion: next, updatedAt: new Date() } });
        }
        await ensureRevision(tx, 'SUB_MODULE', id, next, desiredSubSnapshot(s), opts);
      }
      bump(result, 'SUB_MODULE', item.action);
      result.touched.push({ kind: 'SUB_MODULE', id: id!, code: s.sub_module_code, action: item.action });
      continue;
    }

    // ASSESSMENT_SET
    const st = item.data;
    const existing = state.sets.get(st.key);
    let id = setIdByKey.get(st.key);
    if (item.action !== 'NOOP') {
      const scope: { subModuleId?: string; moduleId?: string; tierId?: string; parentSetId?: string } = {};
      if (st.type === 'ACTIVE_DRILL') {
        scope.subModuleId = subId.get(st.subCode!);
        if (!scope.subModuleId) throw new ContentApplyError('sub_module_not_found', `Sub-modul '${st.subCode}' belum ada.`);
      } else if (st.type === 'SKIP_MODULE_TEST') {
        scope.moduleId = moduleId.get(st.moduleCode!);
        if (!scope.moduleId) throw new ContentApplyError('module_not_found', `Modul '${st.moduleCode}' belum ada.`);
      } else if (st.type === 'SKIP_TIER_TEST' || st.type === 'TIER_BOSS_EXAM') {
        scope.tierId = tierId(st.tierNumber!);
      } else if (st.type === 'BOSS_SECTION') {
        scope.parentSetId = setIdByKey.get(naturalKey({ type: 'TIER_BOSS_EXAM', tier: st.tierNumber }));
        if (!scope.parentSetId) throw new ContentApplyError('boss_parent_missing', `TIER_BOSS_EXAM tier ${st.tierNumber} belum ada.`);
      }
      const values = {
        assessmentType: st.type,
        title: st.title,
        ...scope,
        skillCategory: (st.skill as 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING' | undefined) ?? null,
        timeLimitSeconds: st.timeLimit ?? 1800,
        readingPassageMarkdown: st.passage ?? null,
        listeningAssetId: st.listeningCode ? assetId(st.listeningCode, `assessment_sets.${st.key}.listening_asset_code`) : null,
        questionsJson: st.questions as unknown as object[],
        questionCount: st.questions.length,
        passPercent: st.passPercent ?? null,
        origin: st.origin,
        sourceId: sourceId(st.sourceCode),
        attributionText: st.attribution ?? null,
        contentHash: item.contentHash,
      };
      if (item.action === 'CREATE') {
        const [row] = await tx.insert(assessmentSets).values({ ...values, status: 'DRAFT', version: 1 }).returning();
        id = row!.id;
        setIdByKey.set(st.key, id);
        await ensureRevision(tx, 'ASSESSMENT_SET', id, 1, row, opts);
      } else if (existing) {
        id = existing.id;
        await ensureRevision(tx, 'ASSESSMENT_SET', id, existing.version, existing, opts);
        const [row] = await tx
          .update(assessmentSets)
          .set({ ...values, version: sql`${assessmentSets.version} + 1`, updatedAt: new Date() })
          .where(eq(assessmentSets.id, id))
          .returning();
        await ensureRevision(tx, 'ASSESSMENT_SET', id, row!.version, row, opts);
      }
    }
    bump(result, 'ASSESSMENT_SET', item.action);
    result.touched.push({ kind: 'ASSESSMENT_SET', id: id!, code: st.key, setType: st.type, action: item.action });
  }
  return result;
}
