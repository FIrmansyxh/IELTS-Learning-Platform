import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { assessmentSets, contentAssets, contentSources, modules, subModules } from '@/db/schema';
import type { AssetManifest, ContentIssue, ContentPackage } from '@/contracts/content';
import { writeAudit } from '../audit';
import type { Db } from '../db';
import { safeErr } from '../safe-error';
import { getStorage, type StorageDriver } from '../storage';
import { applyContentPlan, ContentApplyError, type ApplyResult } from './apply';
import { registerFromManifest, validateAssetFile } from './assets';
import { planContentPackage, summarize } from './plan';
import { publish, type Blocker, type PublishEntityType } from './publish';
import { parseAssetManifest, parseContentPackage, type ParseContext, type SourceInfo } from './validate';
import { MODULE_SEEDS } from './curriculum-structure';

const NIL_UUID = '00000000-0000-4000-8000-000000000000';
export const MAX_PACKAGE_BYTES = 5 * 1_048_576;

export interface LoadedPackage {
  raw: unknown;
  rawManifest: unknown | null;
  issues: ContentIssue[];
}

const issue = (path: string, code: string, message: string): ContentIssue => ({ path, code, message, severity: 'error' });

export async function loadPackageDir(dir: string): Promise<LoadedPackage> {
  const issues: ContentIssue[] = [];
  const read = async (file: string, required: boolean): Promise<unknown | null> => {
    const full = path.join(dir, file);
    let st;
    try {
      st = await stat(full);
    } catch {
      if (required) issues.push(issue(file, 'file_not_found', `${file} tidak ditemukan di ${dir}.`));
      return null;
    }
    if (st.size > MAX_PACKAGE_BYTES) {
      issues.push(issue(file, 'package_too_large', 'Berkas melebihi 5 MB.'));
      return null;
    }
    try {
      return JSON.parse(await readFile(full, 'utf8'));
    } catch {
      issues.push(issue(file, 'invalid_json', 'Bukan JSON yang valid.'));
      return null;
    }
  };
  const raw = await read('content.json', true);
  const rawManifest = await read('assets.manifest.json', false);
  return { raw, rawManifest, issues };
}

/** Konteks validasi dari DB (bila terhubung) atau dari struktur statis seed (mode luring). */
export async function contextFromDb(db: Db): Promise<ParseContext> {
  const [srcRows, modRows, assetRows] = await Promise.all([
    db.select().from(contentSources),
    db.select({ code: modules.moduleCode, skill: modules.skillCategory }).from(modules),
    db.select({ code: contentAssets.assetCode, kind: contentAssets.kind }).from(contentAssets).where(isNotNull(contentAssets.assetCode)),
  ]);
  return {
    sources: new Map(srcRows.map((s) => [s.code, { licenseType: s.licenseType, shareAlike: s.shareAlike, mayStoreCopy: s.mayStoreCopy }])),
    modules: new Map(modRows.map((m) => [m.code, { tier: Number(m.code.split('.')[0]), skill: m.skill }])),
    assets: new Map(assetRows.map((a) => [a.code as string, { kind: a.kind }])),
  };
}

export function staticContext(sources: Map<string, SourceInfo>): ParseContext {
  return {
    sources,
    modules: new Map(MODULE_SEEDS.map((m) => [m.code, { tier: m.tier, skill: m.skill }])),
  };
}

export interface ValidationOutcome {
  errors: ContentIssue[];
  warnings: ContentIssue[];
  pkg?: ContentPackage;
  manifest?: AssetManifest;
}

/** validate: paket + manifest + berkas aset, tanpa menulis DB. */
export async function validatePackage(dir: string, ctx: ParseContext): Promise<ValidationOutcome> {
  const loaded = await loadPackageDir(dir);
  const errors = [...loaded.issues];
  const warnings: ContentIssue[] = [];
  if (loaded.raw === null) return { errors, warnings };

  let manifest: AssetManifest | undefined;
  if (loaded.rawManifest !== null) {
    const m = parseAssetManifest(loaded.rawManifest, { sources: ctx.sources });
    warnings.push(...m.warnings);
    if (m.ok) manifest = m.data;
    else errors.push(...m.errors.map((e) => ({ ...e, path: `assets.manifest.json:${e.path}` })));
  }
  const p = parseContentPackage(loaded.raw, { ...ctx, manifest });
  warnings.push(...p.warnings);
  if (!p.ok) errors.push(...p.errors);

  if (manifest) {
    const seenSha = new Map<string, string>();
    for (const [i, a] of manifest.assets.entries()) {
      const v = await validateAssetFile(dir, a, `assets.manifest.json:assets[${i}].file`);
      if (!v.ok) {
        errors.push(...v.errors);
        continue;
      }
      warnings.push(...v.warnings);
      const prev = seenSha.get(v.asset.sha256);
      if (prev && prev !== a.asset_code) errors.push(issue(`assets.manifest.json:assets[${i}].file`, 'duplicate_file', `Berkas identik dengan '${prev}'.`));
      seenSha.set(v.asset.sha256, a.asset_code);
    }
  }
  return { errors, warnings, pkg: p.ok ? p.data : undefined, manifest };
}

export const formatIssue = (i: ContentIssue) => `${i.severity === 'warning' ? 'PERINGATAN ' : ''}${i.path}: ${i.code}: ${i.message}`;

export interface ImportOptions {
  dir: string;
  publish: boolean;
  dryRun: boolean;
  actorUserId: string | null;
  storage?: StorageDriver;
}
export interface ImportOutcome {
  exitCode: 0 | 1 | 2 | 3;
  lines: string[];
  result?: ApplyResult;
  blockers?: Blocker[];
}

const PUBLISH_ORDER = (t: { kind: string; setType?: string }) =>
  t.kind === 'ASSESSMENT_SET' ? (t.setType === 'TIER_BOSS_EXAM' ? 1 : 0) : t.kind === 'SUB_MODULE' ? 2 : 3;

/** import: validate -> rencana -> satu transaksi (aset, modul, sub-modul, set) -> opsional publish. */
export async function runImport(db: Db, o: ImportOptions): Promise<ImportOutcome> {
  const lines: string[] = [];
  const ctx = await contextFromDb(db);
  const v = await validatePackage(o.dir, ctx);
  lines.push(...v.warnings.map(formatIssue));
  if (v.errors.length || !v.pkg) {
    lines.push(...v.errors.map(formatIssue));
    return { exitCode: 1, lines };
  }
  const pkg = v.pkg;
  const manifest = v.manifest;
  const storage = o.storage ?? getStorage();
  const copied: string[] = [];

  try {
    if (o.dryRun) {
      const plan = await db.transaction(async (tx) => planContentPackage(tx, pkg));
      const s = summarize(plan);
      let newAssets = 0;
      for (const a of manifest?.assets ?? []) {
        const [row] = await db.select({ id: contentAssets.id }).from(contentAssets).where(and(eq(contentAssets.assetCode, a.asset_code)));
        if (!row) newAssets++;
      }
      lines.push(
        `DRY-RUN: modules +${s.MODULE.create} ~${s.MODULE.update} =${s.MODULE.noop} | sub_modules +${s.SUB_MODULE.create} ~${s.SUB_MODULE.update} =${s.SUB_MODULE.noop} | assessment_sets +${s.ASSESSMENT_SET.create} ~${s.ASSESSMENT_SET.update} =${s.ASSESSMENT_SET.noop} | assets +${newAssets}`,
      );
      return { exitCode: 0, lines };
    }

    class Abort extends Error {
      constructor(readonly outcome: ImportOutcome) {
        super('abort');
      }
    }
    let applied: ApplyResult | undefined;
    let newAssets = 0;
    try {
      await db.transaction(async (tx) => {
        if (manifest) {
          const reg = await registerFromManifest(tx, manifest, o.dir, o.actorUserId, storage);
          copied.push(...reg.copiedKeys);
          newAssets = reg.created;
          if (reg.errors.length) throw new Abort({ exitCode: 1, lines: reg.errors.map(formatIssue) });
        }
        const plan = await planContentPackage(tx, pkg);
        if (plan.errors.length) throw new Abort({ exitCode: 1, lines: plan.errors.map(formatIssue) });
        applied = await applyContentPlan(tx, plan, { actorUserId: o.actorUserId });
        const c = applied.counts;
        await writeAudit(tx, {
          actorUserId: o.actorUserId,
          action: 'CONTENT_IMPORTED_CLI',
          entityType: 'content_package',
          metadata: { modules: c.MODULE, sub_modules: c.SUB_MODULE, assessment_sets: c.ASSESSMENT_SET, assets_created: newAssets, publish: o.publish },
        });
        if (o.publish) {
          const blockers: Blocker[] = [];
          // Modul terkait (induk sub-modul / cakupan Skip Test Modul) ikut dipublikasikan setelah sub-modul.
          const touched = [...applied.touched];
          const have = new Set(touched.filter((t) => t.kind === 'MODULE').map((t) => t.id));
          const subIds = touched.filter((t) => t.kind === 'SUB_MODULE').map((t) => t.id);
          const setIds = touched.filter((t) => t.kind === 'ASSESSMENT_SET').map((t) => t.id);
          const related = await tx
            .selectDistinct({ id: subModules.moduleId })
            .from(subModules)
            .where(inArray(subModules.id, subIds.length ? subIds : [NIL_UUID]));
          const scoped = await tx
            .selectDistinct({ id: assessmentSets.moduleId })
            .from(assessmentSets)
            .where(inArray(assessmentSets.id, setIds.length ? setIds : [NIL_UUID]));
          for (const r of [...related, ...scoped]) {
            if (r.id && !have.has(r.id)) {
              have.add(r.id);
              touched.push({ kind: 'MODULE', id: r.id, code: r.id, action: 'NOOP' });
            }
          }
          const order = touched.sort((a, b) => PUBLISH_ORDER(a) - PUBLISH_ORDER(b));
          for (const t of order) {
            const type = t.kind as PublishEntityType;
            const r = await publish(tx, type, t.id, { userId: o.actorUserId });
            if (!r.published) blockers.push(...r.blockers);
          }
          if (blockers.length) {
            throw new Abort({
              exitCode: 2,
              lines: ['Publikasi terhalang; tidak ada perubahan yang disimpan:', ...blockers.map((b) => `  ${b.code} ${b.entity_type} ${b.entity_id}: ${b.detail}`)],
              blockers,
            });
          }
        }
      });
    } catch (e) {
      if (e instanceof Abort) {
        for (const k of copied) await storage.remove(k).catch(() => undefined);
        return { ...e.outcome, lines: [...lines, ...e.outcome.lines] };
      }
      throw e;
    }
    const c = applied!.counts;
    lines.push(
      `OK: modules +${c.MODULE.created} ~${c.MODULE.updated} =${c.MODULE.unchanged} | sub_modules +${c.SUB_MODULE.created} ~${c.SUB_MODULE.updated} =${c.SUB_MODULE.unchanged} | assessment_sets +${c.ASSESSMENT_SET.created} ~${c.ASSESSMENT_SET.updated} =${c.ASSESSMENT_SET.unchanged} | assets +${newAssets}`,
    );
    return { exitCode: 0, lines, result: applied };
  } catch (e) {
    for (const k of copied) await storage.remove(k).catch(() => undefined);
    if (e instanceof ContentApplyError) return { exitCode: 1, lines: [...lines, `${e.path}: ${e.code}: ${e.message}`] };
    return { exitCode: 3, lines: [...lines, `Galat teknis: ${safeErr(e).name}${safeErr(e).code ? ` (${safeErr(e).code})` : ''}`] };
  }
}
