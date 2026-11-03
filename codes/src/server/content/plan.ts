import { ne } from 'drizzle-orm';
import {
  assessmentSets,
  contentAssets,
  contentSources,
  learningMaterials,
  modules,
  subModules,
  tiers,
} from '@/db/schema';
import type { ContentIssue, ContentPackage, ModuleItemType, Question, SubModuleItemType } from '@/contracts/content';
import type { Tx } from '../db';
import { canonicalJson, naturalKey, sha256Hex, type SetKind } from './validate';

export type PlanAction = 'CREATE' | 'UPDATE' | 'NOOP';
export type EntityKind = 'MODULE' | 'SUB_MODULE' | 'ASSESSMENT_SET';

export interface NormalizedSet {
  key: string;
  type: SetKind;
  title: string;
  subCode?: string;
  moduleCode?: string;
  tierNumber?: number;
  skill?: string;
  timeLimit?: number;
  passPercent?: number;
  passage?: string;
  listeningCode?: string;
  origin: 'ORIGINAL_AUTHORED' | 'AI_GENERATED_REVIEWED' | 'OPEN_LICENSED_ADAPTED';
  sourceCode?: string;
  attribution?: string;
  questions: Question[];
}

export type PlanItem =
  | { entityKind: 'MODULE'; action: PlanAction; entityCode: string; contentHash: string; data: ModuleItemType }
  | { entityKind: 'SUB_MODULE'; action: PlanAction; entityCode: string; contentHash: string; data: SubModuleItemType }
  | { entityKind: 'ASSESSMENT_SET'; action: PlanAction; entityCode: string; contentHash: string; data: NormalizedSet };

export interface ContentPlan {
  items: PlanItem[];
  errors: ContentIssue[];
}

export function summarize(plan: ContentPlan) {
  const out: Record<EntityKind, { create: number; update: number; noop: number }> = {
    MODULE: { create: 0, update: 0, noop: 0 },
    SUB_MODULE: { create: 0, update: 0, noop: 0 },
    ASSESSMENT_SET: { create: 0, update: 0, noop: 0 },
  };
  for (const it of plan.items) out[it.entityKind][it.action === 'CREATE' ? 'create' : it.action === 'UPDATE' ? 'update' : 'noop']++;
  return out;
}

const SET_ORDER: Record<string, number> = {
  ACTIVE_DRILL: 0,
  SKIP_MODULE_TEST: 1,
  SKIP_TIER_TEST: 2,
  PLACEMENT_TEST: 3,
  TIER_BOSS_EXAM: 4,
  BOSS_SECTION: 5,
};

/** Ratakan paket menjadi daftar set (drill dari sub-modul + set mandiri), urutan aman untuk pembuatan. */
export function flattenSets(pkg: ContentPackage): NormalizedSet[] {
  const out: NormalizedSet[] = [];
  for (const s of pkg.sub_modules ?? []) {
    if (!s.active_drill) continue;
    out.push({
      key: naturalKey({ type: 'ACTIVE_DRILL', sub: s.sub_module_code }),
      type: 'ACTIVE_DRILL',
      title: `${s.sub_module_title} - Active Drill`,
      subCode: s.sub_module_code,
      timeLimit: s.active_drill.time_limit_seconds,
      passPercent: s.active_drill.pass_percent,
      passage: s.active_drill.reading_passage_markdown,
      listeningCode: s.active_drill.listening_asset_code,
      origin: s.origin ?? 'ORIGINAL_AUTHORED',
      sourceCode: s.source_code,
      attribution: s.attribution_text,
      questions: s.active_drill.questions,
    });
  }
  const sections = (pkg.assessment_sets ?? []).filter((x) => x.set_type === 'BOSS_SECTION');
  for (const st of pkg.assessment_sets ?? []) {
    let timeLimit = st.time_limit_seconds;
    if (st.set_type === 'TIER_BOSS_EXAM' && timeLimit === undefined) {
      const sum = sections.filter((c) => c.tier_number === st.tier_number).reduce((a, c) => a + (c.time_limit_seconds ?? 0), 0);
      timeLimit = Math.max(30, sum);
    }
    out.push({
      key: naturalKey({ type: st.set_type, module: st.module_code, tier: st.tier_number, skill: st.skill_category }),
      type: st.set_type,
      title: st.title,
      moduleCode: st.module_code,
      tierNumber: st.tier_number,
      skill: st.skill_category,
      timeLimit,
      passPercent: st.pass_percent,
      passage: st.reading_passage_markdown,
      listeningCode: st.listening_asset_code,
      origin: st.origin ?? 'ORIGINAL_AUTHORED',
      sourceCode: st.source_code,
      attribution: st.attribution_text,
      questions: st.questions,
    });
  }
  return out.sort((a, b) => (SET_ORDER[a.type] ?? 9) - (SET_ORDER[b.type] ?? 9));
}

export const setHash = (s: NormalizedSet) => sha256Hex(canonicalJson(s));

export interface MaterialsSnapshot {
  article_markdown: string;
  videos: unknown[];
  slides: unknown[];
  attachments: unknown[];
  mini_task: unknown;
  origin: string;
  source_code: string | null;
  attribution_text: string | null;
}

/** Snapshot kanonik sub-modul dari item paket (rujukan simbolik: asset_code / video_id). */
export function desiredSubSnapshot(s: SubModuleItemType) {
  const m = s.materials;
  return {
    title: s.sub_module_title,
    passing_score_percent: s.passing_score_percent ?? 75,
    order_index: s.order_index,
    materials: m
      ? {
          article_markdown: m.article_markdown,
          videos: (m.videos ?? []).map((v) => ({
            video_id: v.video_id,
            title: v.title,
            instructor_channel: v.instructor_channel ?? null,
            language: v.language,
            start_sec: v.start_sec,
            end_sec: v.end_sec,
          })),
          slides: (m.slides ?? []).map((x) => ({ order: x.order, asset_code: x.asset_code, caption: x.caption, alt: x.alt ?? x.caption })),
          attachments: (m.attachments ?? []).map((a) => ({ title: a.title, file_type: a.file_type, asset_code: a.asset_code })),
          mini_task: m.mini_task ?? null,
          origin: s.origin ?? 'ORIGINAL_AUTHORED',
          source_code: s.source_code ?? null,
          attribution_text: s.attribution_text ?? null,
        }
      : undefined,
  };
}

export interface DbState {
  tierId: Map<number, string>;
  modules: Map<string, typeof modules.$inferSelect>;
  subs: Map<string, typeof subModules.$inferSelect>;
  materials: Map<string, typeof learningMaterials.$inferSelect>; // by sub id
  assetCodeById: Map<string, string | null>;
  assetVideoById: Map<string, string | null>;
  sourceCodeById: Map<string, string>;
  sets: Map<string, typeof assessmentSets.$inferSelect>; // by natural key
}

export async function loadDbState(tx: Tx): Promise<DbState> {
  const [tierRows, modRows, subRows, matRows, assetRows, srcRows, setRows] = await Promise.all([
    tx.select().from(tiers),
    tx.select().from(modules),
    tx.select().from(subModules),
    tx.select().from(learningMaterials),
    tx.select({ id: contentAssets.id, code: contentAssets.assetCode, ref: contentAssets.externalRef }).from(contentAssets),
    tx.select({ id: contentSources.id, code: contentSources.code }).from(contentSources),
    tx.select().from(assessmentSets).where(ne(assessmentSets.status, 'ARCHIVED')),
  ]);
  const modById = new Map(modRows.map((m) => [m.id, m]));
  const subById = new Map(subRows.map((s) => [s.id, s]));
  const tierById = new Map(tierRows.map((t) => [t.id, t]));
  const setById = new Map(setRows.map((s) => [s.id, s]));
  const sets = new Map<string, typeof assessmentSets.$inferSelect>();
  for (const s of setRows) {
    let key: string | null = null;
    switch (s.assessmentType) {
      case 'ACTIVE_DRILL':
        key = naturalKey({ type: 'ACTIVE_DRILL', sub: subById.get(s.subModuleId ?? '')?.subModuleCode });
        break;
      case 'SKIP_MODULE_TEST':
        key = naturalKey({ type: 'SKIP_MODULE_TEST', module: modById.get(s.moduleId ?? '')?.moduleCode });
        break;
      case 'SKIP_TIER_TEST':
      case 'TIER_BOSS_EXAM':
        key = naturalKey({ type: s.assessmentType, tier: tierById.get(s.tierId ?? '')?.tierNumber });
        break;
      case 'BOSS_SECTION': {
        const parent = setById.get(s.parentSetId ?? '');
        key = naturalKey({ type: 'BOSS_SECTION', tier: tierById.get(parent?.tierId ?? '')?.tierNumber, skill: s.skillCategory ?? undefined });
        break;
      }
      case 'PLACEMENT_TEST':
        key = naturalKey({ type: 'PLACEMENT_TEST' });
        break;
    }
    if (key) sets.set(key, s);
  }
  return {
    tierId: new Map(tierRows.map((t) => [Number(t.tierNumber), t.id])),
    modules: new Map(modRows.map((m) => [m.moduleCode, m])),
    subs: new Map(subRows.map((s) => [s.subModuleCode, s])),
    materials: new Map(matRows.map((m) => [m.subModuleId, m])),
    assetCodeById: new Map(assetRows.map((a) => [a.id, a.code])),
    assetVideoById: new Map(assetRows.map((a) => [a.id, a.ref])),
    sourceCodeById: new Map(srcRows.map((s) => [s.id, s.code])),
    sets,
  };
}

/** Snapshot kanonik dari baris DB (bentuk sama dengan desiredSubSnapshot). */
export function dbSubSnapshot(db: DbState, sub: typeof subModules.$inferSelect, withMaterials: boolean) {
  const lm = db.materials.get(sub.id);
  return {
    title: sub.title,
    passing_score_percent: sub.passingScorePercent,
    order_index: sub.orderIndex,
    materials:
      withMaterials && lm
        ? {
            article_markdown: lm.articleMarkdown,
            videos: ((lm.videosJson as Array<Record<string, unknown>>) ?? []).map((v) => ({
              video_id: v.video_id ?? db.assetVideoById.get(v.asset_id as string) ?? null,
              title: v.title,
              instructor_channel: v.instructor_channel ?? null,
              language: v.language,
              start_sec: v.start_sec,
              end_sec: v.end_sec,
            })),
            slides: ((lm.slidesJson as Array<Record<string, unknown>>) ?? []).map((x) => ({
              order: x.order,
              asset_code: db.assetCodeById.get(x.asset_id as string) ?? null,
              caption: x.caption,
              alt: x.alt ?? x.caption,
            })),
            attachments: ((lm.attachmentsJson as Array<Record<string, unknown>>) ?? []).map((a) => ({
              title: a.title,
              file_type: a.file_type,
              asset_code: db.assetCodeById.get(a.asset_id as string) ?? null,
            })),
            mini_task: Object.keys((lm.miniTaskJson as object) ?? {}).length ? lm.miniTaskJson : null,
            origin: lm.origin,
            source_code: lm.sourceId ? (db.sourceCodeById.get(lm.sourceId) ?? null) : null,
            attribution_text: lm.attributionText ?? null,
          }
        : undefined,
  };
}

/** Bangun rencana CREATE/UPDATE/NOOP per item (tanpa menulis). */
export async function planContentPackage(tx: Tx, pkg: ContentPackage, state?: DbState): Promise<ContentPlan> {
  const db = state ?? (await loadDbState(tx));
  const items: PlanItem[] = [];
  const errors: ContentIssue[] = [];

  (pkg.modules ?? []).forEach((m, i) => {
    const existing = db.modules.get(m.module_code);
    const desired = { title: m.title, skill: m.module_category, order: m.order_index };
    const hash = sha256Hex(canonicalJson(desired));
    let action: PlanAction = 'CREATE';
    if (existing) {
      if (db.tierId.get(m.tier_number) !== existing.tierId) {
        errors.push({ path: `modules[${i}].tier_number`, code: 'tier_conflict', message: 'Tier modul yang sudah ada tidak dapat diubah.', severity: 'error' });
      }
      const cur = sha256Hex(canonicalJson({ title: existing.title, skill: existing.skillCategory, order: existing.orderIndex }));
      action = cur === hash ? 'NOOP' : 'UPDATE';
    }
    items.push({ entityKind: 'MODULE', action, entityCode: m.module_code, contentHash: hash, data: m });
  });

  for (const s of pkg.sub_modules ?? []) {
    const desired = desiredSubSnapshot(s);
    const hash = sha256Hex(canonicalJson(desired));
    const existing = db.subs.get(s.sub_module_code);
    let action: PlanAction = 'CREATE';
    if (existing) {
      const cur = sha256Hex(canonicalJson(dbSubSnapshot(db, existing, desired.materials !== undefined)));
      action = cur === hash ? 'NOOP' : 'UPDATE';
    }
    items.push({ entityKind: 'SUB_MODULE', action, entityCode: s.sub_module_code, contentHash: hash, data: s });
  }

  for (const st of flattenSets(pkg)) {
    const hash = setHash(st);
    const existing = db.sets.get(st.key);
    items.push({
      entityKind: 'ASSESSMENT_SET',
      action: !existing ? 'CREATE' : existing.contentHash === hash ? 'NOOP' : 'UPDATE',
      entityCode: st.key,
      contentHash: hash,
      data: st,
    });
  }
  return { items, errors };
}
