/**
 * Impor Bank Soal lewat CLI (SPEC-022 D8): `npm run content:import -- --dir <dir> [--publish] [--dry-run]`.
 *
 * - Berkas bank = `*.json` di folder yang memuat kunci `bank_contract_version` (kontrak bank 1.0); `content.json` dan
 *   `assets.manifest.json` bukan berkas bank.
 * - Idempoten per `bank_code` lewat `content_hash` (SHA-256 JSON kanonik): hash sama = NOOP; beda = UPDATE dan `version + 1`
 *   (snapshot lama disimpan di `content_revisions`); bank baru = INSERT berstatus DRAFT.
 * - Bank `pending_audio: true` selalu DRAFT, `listening_asset_id` NULL, dan dilewati `--publish` (D7).
 * - Semua tulis terjadi dalam SATU transaksi; penghalang publikasi membatalkan seluruh impor (exit 2).
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { assessmentSets, contentAssets, contentSources } from '@/db/schema';
import type { AssetManifest, ContentIssue } from '@/contracts/content';
import type { QuestionBank } from '@/contracts/question-bank';
import { writeAudit } from '../audit';
import { execute, type Db, type Tx } from '../db';
import { safeErr } from '../safe-error';
import { getStorage, type StorageDriver } from '../storage';
import { registerFromManifest, validateAssetFile } from './assets';
import { CONTENT_IMPORT_HINT, validateBankPackage, type KnownAssets } from './bank-validate';
import { ensureRevision } from './apply';
import { changeStatus, type Blocker } from './publish';
import { isListeningBankKind } from '@/contracts/question-bank';
import { validateListeningReview } from '../listening/review-gate';
import { existsSync } from 'node:fs';
import { canonicalJson, parseAssetManifest, sha256Hex } from './validate';

const MAX_FILE_BYTES = 5 * 1_048_576;
const NOT_BANK_FILES = new Set(['content.json', 'assets.manifest.json']);


export function extractListeningPartCode(bank: { bank_code: string; listening_asset_code?: string }): string | null {
  if (bank.listening_asset_code) {
    const parts = bank.listening_asset_code.split('/');
    const last = parts[parts.length - 1];
    if (last.startsWith('gt-l-s')) {
      return last.toUpperCase();
    }
  }
  const m = bank.bank_code.match(/^GT-LIS-S([1-4])-(\d{3})$/);
  if (m) {
    return `GT-L-S${m[1]}-${m[2]}`;
  }
  return null;
}

const issue = (p: string, code: string, message: string): ContentIssue => ({ path: p, code, message, severity: 'error' });
export const formatBankIssue = (i: ContentIssue) => `${i.severity === 'warning' ? 'PERINGATAN ' : ''}${i.path}: ${i.code}: ${i.message}`;

export interface BankFile {
  file: string;
  raw: unknown;
}

/** Berkas bank di folder (urut nama). Galat baca/parse dikembalikan sebagai `issues`. */
export async function findBankFiles(dir: string): Promise<{ files: BankFile[]; issues: ContentIssue[] }> {
  const files: BankFile[] = [];
  const issues: ContentIssue[] = [];
  const unmarked: string[] = [];
  let names: string[];
  let hasContentJson = false;
  try {
    const all = await readdir(dir);
    hasContentJson = all.includes('content.json') || all.includes('tracks.json'); // paket konten murni (SPEC-021: tracks.json)
    names = all.filter((n) => n.endsWith('.json') && !NOT_BANK_FILES.has(n)).sort();
  } catch {
    return { files, issues: [issue(dir, 'dir_not_found', `Folder ${dir} tidak dapat dibaca.`)] };
  }
  for (const n of names) {
    const full = path.join(dir, n);
    if ((await stat(full)).size > MAX_FILE_BYTES) {
      issues.push(issue(n, 'package_too_large', 'Berkas melebihi 5 MB.'));
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(full, 'utf8'));
    } catch {
      issues.push(issue(n, 'invalid_json', 'Bukan JSON yang valid.'));
      continue;
    }
    if (typeof raw === 'object' && raw !== null && 'bank_contract_version' in raw) files.push({ file: n, raw });
    else unmarked.push(n);
  }
  // Berkas *.json tanpa `bank_contract_version` TIDAK boleh dilewati diam-diam (salah ketik kunci = bank tak pernah terimpor).
  // Pengecualian: folder paket konten murni (ada content.json dan tidak ada satu pun berkas bank) boleh memuat JSON lain.
  if (unmarked.length > 0 && (files.length > 0 || !hasContentJson)) {
    for (const n of unmarked) {
      issues.push(issue(n, 'bank_contract_version_missing', 'Berkas .json ini tidak memuat kunci bank_contract_version (salah ketik?). Tambahkan kunci itu atau pindahkan berkas dari folder.'));
    }
  }
  return { files, issues };
}

async function readManifest(dir: string, sources: Map<string, unknown>): Promise<{ manifest?: AssetManifest; issues: ContentIssue[] }> {
  let text: string;
  try {
    text = await readFile(path.join(dir, 'assets.manifest.json'), 'utf8');
  } catch {
    return { issues: [] };
  }
  try {
    const m = parseAssetManifest(JSON.parse(text), { sources: sources as never });
    if (!m.ok) return { issues: m.errors.map((e) => ({ ...e, path: `assets.manifest.json:${e.path}` })) };
    const issues: ContentIssue[] = [];
    for (const [i, a] of m.data.assets.entries()) {
      const v = await validateAssetFile(dir, a, `assets.manifest.json:assets[${i}].file`);
      if (!v.ok) issues.push(...v.errors);
    }
    return { manifest: m.data, issues };
  } catch {
    return { issues: [issue('assets.manifest.json', 'invalid_json', 'Bukan JSON yang valid.')] };
  }
}

export interface BankContext {
  sources: Map<string, { licenseType: string; shareAlike: boolean; mayStoreCopy: boolean }>;
  dbAssets: KnownAssets;
  /** question_id -> bank_code pemiliknya di DB (untuk keunikan GLOBAL, D3). */
  dbQuestionOwner: ReadonlyMap<string, string>;
}

export async function bankContextFromDb(db: Db | Tx): Promise<BankContext> {
  const [srcRows, assetRows, qRows] = await Promise.all([
    db.select().from(contentSources),
    db.select({ code: contentAssets.assetCode, kind: contentAssets.kind, rights: contentAssets.rightsStatus }).from(contentAssets),
    execute<{ bank_code: string; qid: string }>(
      db,
      sql`SELECT s.bank_code AS bank_code, json_extract(e.value, '$.question_id') AS qid
          FROM assessment_sets s, json_each(s.questions_json) e WHERE s.assessment_type = 'QUESTION_BANK'`,
    ),
  ]);
  return {
    sources: new Map(srcRows.map((s) => [s.code, { licenseType: s.licenseType, shareAlike: s.shareAlike, mayStoreCopy: s.mayStoreCopy }])),
    dbAssets: new Map(assetRows.filter((a) => a.code).map((a) => [a.code as string, { kind: a.kind, rights: a.rights }])),
    dbQuestionOwner: new Map(qRows.rows.map((r) => [r.qid, r.bank_code])),
  };
}

/**
 * Konteks validasi tanpa menulis/membuat DB: bila berkas DB ada, dibuka READ-ONLY untuk aset, sumber, dan ID soal;
 * bila tidak ada, memakai `staticSources` dan konteks aset kosong (hanya manifest paket yang dikenal).
 */
export async function bankContextReadonly(dbPath: string, staticSources: BankContext['sources']): Promise<BankContext> {
  const { existsSync, readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const fallbackAssets = new Map<string, { kind: string; rights: string }>();
  // Bila ada berkas manifest aset listening di repo, tambahkan agar validator bank dapat mengenalinya tanpa DB
  const listeningManifestPath = path.resolve('content/gt-listening/assets.manifest.json');
  if (existsSync(listeningManifestPath)) {
    try {
      const parsed = JSON.parse(readFileSync(listeningManifestPath, 'utf8'));
      for (const a of parsed.assets ?? []) {
        fallbackAssets.set(a.asset_code, { kind: a.kind, rights: a.rights_status ?? '' });
      }
    } catch {
      // abaikan bila tidak valid
    }
  }

  const empty: BankContext = { sources: staticSources, dbAssets: fallbackAssets, dbQuestionOwner: new Map() };
  if (dbPath === ':memory:' || !existsSync(dbPath)) return empty;
  const { DatabaseSync } = await import('node:sqlite');
  let raw: InstanceType<typeof DatabaseSync> | undefined;
  try {
    raw = new DatabaseSync(dbPath, { readOnly: true });
    const sources = new Map(staticSources);
    for (const s of raw.prepare('SELECT code, license_type AS lt, share_alike AS sa, may_store_copy AS ms FROM content_sources').all() as Array<{ code: string; lt: string; sa: number; ms: number }>) {
      sources.set(s.code, { licenseType: s.lt, shareAlike: Boolean(s.sa), mayStoreCopy: Boolean(s.ms) });
    }
    const dbAssets = new Map(
      (raw.prepare('SELECT asset_code AS c, kind, rights_status AS r FROM content_assets WHERE asset_code IS NOT NULL').all() as Array<{ c: string; kind: string; r: string }>).map((a) => [a.c, { kind: a.kind, rights: a.r }]),
    );
    for (const [k, v] of fallbackAssets.entries()) {
      if (!dbAssets.has(k)) dbAssets.set(k, v);
    }
    const owners = new Map(
      (raw.prepare(`SELECT s.bank_code AS b, json_extract(e.value, '$.question_id') AS q FROM assessment_sets s, json_each(s.questions_json) e WHERE s.assessment_type = 'QUESTION_BANK'`).all() as Array<{ b: string; q: string }>).map((r) => [r.q, r.b]),
    );
    return { sources, dbAssets, dbQuestionOwner: owners };
  } catch {
    return empty; // DB tidak terbaca / belum bermigrasi: validasi tetap berjalan tanpa konteks DB
  } finally {
    raw?.close();
  }
}

export interface BankValidationOutcome {
  errors: ContentIssue[];
  warnings: ContentIssue[];
  banks: QuestionBank[];
  manifest?: AssetManifest;
}

/** Validasi seluruh berkas bank di folder (tanpa menulis DB). */
export async function validateBankDir(dir: string, ctx: Pick<BankContext, 'dbAssets' | 'dbQuestionOwner'> & { sources?: BankContext['sources'] }, files: BankFile[]): Promise<BankValidationOutcome> {
  const errors: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];
  const banks: QuestionBank[] = [];
  const mf = await readManifest(dir, ctx.sources ?? new Map());
  errors.push(...mf.issues);
  const manifestAssets: KnownAssets = new Map((mf.manifest?.assets ?? []).map((a) => [a.asset_code, { kind: a.kind, rights: a.rights_status }]));

  const seen = new Set<string>();
  const codesSeen = new Map<string, string>();
  for (const f of files) {
    const r = validateBankPackage(f.raw, seen, { manifestAssets, dbAssets: ctx.dbAssets });
    warnings.push(...r.warnings.map((w) => ({ ...w, path: `${f.file}:${w.path}` })));
    if (!r.ok) {
      errors.push(...r.errors.map((e) => ({ ...e, path: `${f.file}:${e.path}` })));
      continue;
    }
    for (const [bi, b] of r.data.banks.entries()) {
      const prev = codesSeen.get(b.bank_code);
      if (prev) errors.push(issue(`${f.file}:banks[${bi}].bank_code`, 'duplicate_bank_code', `bank_code juga ada di ${prev}.`));
      codesSeen.set(b.bank_code, f.file);
      for (const [qi, q] of b.questions.entries()) {
        const owner = ctx.dbQuestionOwner.get(q.question_id);
        if (owner && owner !== b.bank_code) {
          errors.push(issue(`${f.file}:banks[${bi}].questions[${qi}].question_id`, 'duplicate_question_id', `question_id sudah dipakai bank '${owner}' di database.`));
        }
      }
      if (b.source_code && ctx.sources && !ctx.sources.has(b.source_code)) {
        errors.push(issue(`${f.file}:banks[${bi}].source_code`, 'source_not_found', `Sumber '${b.source_code}' tidak dikenal.`));
      }
      banks.push(b);
    }
  }
  return { errors, warnings, banks, manifest: mf.manifest };
}

export type BankAction = 'CREATE' | 'UPDATE' | 'NOOP';
export interface BankImportRow {
  bank_code: string;
  action: BankAction;
  status: string;
  pending_audio: boolean;
  question_count: number;
}
export interface BankImportOutcome {
  exitCode: 0 | 1 | 2 | 3;
  lines: string[];
  banks: BankImportRow[];
}
export interface BankImportOptions {
  dir: string;
  publish: boolean;
  dryRun: boolean;
  actorUserId: string | null;
  storage?: StorageDriver;
}

const hashOf = (b: QuestionBank) => sha256Hex(canonicalJson(b));

export async function runBankImport(db: Db, o: BankImportOptions, found?: Awaited<ReturnType<typeof findBankFiles>>): Promise<BankImportOutcome> {
  const lines: string[] = [];
  const f = found ?? (await findBankFiles(o.dir));
  if (f.issues.length) return { exitCode: 1, lines: f.issues.map(formatBankIssue), banks: [] };
  const ctx = await bankContextFromDb(db);
  const v = await validateBankDir(o.dir, ctx, f.files);
  lines.push(...v.warnings.map(formatBankIssue));
  if (v.errors.length) return { exitCode: 1, lines: [...lines, ...v.errors.map(formatBankIssue)], banks: [] };

  const storage = o.storage ?? getStorage();
  const copied: string[] = [];
  const rows: BankImportRow[] = [];
  let hasListeningReviewFailures = false;

  class Abort extends Error {
    constructor(readonly outcome: BankImportOutcome) {
      super('abort');
    }
  }

  const work = async (tx: Tx, write: boolean): Promise<void> => {
    if (write && v.manifest) {
      const reg = await registerFromManifest(tx, v.manifest, o.dir, o.actorUserId, storage);
      copied.push(...reg.copiedKeys);
      if (reg.errors.length) throw new Abort({ exitCode: 1, lines: reg.errors.map(formatBankIssue), banks: [] });
    }
    const sourceIds = new Map((await tx.select({ id: contentSources.id, code: contentSources.code }).from(contentSources)).map((s) => [s.code, s.id]));
    const assetIds = new Map(
      (await tx.select({ id: contentAssets.id, code: contentAssets.assetCode }).from(contentAssets)).filter((a) => a.code).map((a) => [a.code as string, a.id]),
    );
    const publishIds: Array<{ id: string; code: string; bank: QuestionBank }> = [];

    for (const b of v.banks) {
      const hash = hashOf(b);
      const [existing] = await tx.select().from(assessmentSets).where(eq(assessmentSets.bankCode, b.bank_code));
      const action: BankAction = !existing ? 'CREATE' : existing.contentHash === hash ? 'NOOP' : 'UPDATE';
      const pending = b.pending_audio;
      let id = existing?.id;
      let status = existing?.status ?? 'DRAFT';

      if (action !== 'NOOP' && write) {
        const listeningAssetId = b.listening_asset_code ? (assetIds.get(b.listening_asset_code) ?? null) : null;
        if (b.listening_asset_code && !listeningAssetId) {
          throw new Abort({ exitCode: 1, lines: [`${b.bank_code}: listening_asset_unregistered: aset '${b.listening_asset_code}' belum terdaftar.${CONTENT_IMPORT_HINT}`], banks: [] });
        }
        const values = {
          assessmentType: 'QUESTION_BANK' as const,
          title: b.title,
          skillCategory: b.skill,
          timeLimitSeconds: 0,
          readingPassageMarkdown: b.reading_passage_markdown ?? null,
          listeningAssetId,
          questionsJson: b.questions as unknown as object[],
          questionCount: b.questions.length,
          origin: b.origin,
          sourceId: b.source_code ? (sourceIds.get(b.source_code) ?? null) : null,
          attributionText: b.attribution_text ?? null,
          contentHash: hash,
          bankCode: b.bank_code,
          bankKind: b.bank_kind,
          examModule: b.exam_module,
          tags: b.tags,
        };
        if (!existing) {
          const [row] = await tx.insert(assessmentSets).values({ ...values, status: 'DRAFT', version: 1 }).returning();
          id = row!.id;
          await ensureRevision(tx, 'ASSESSMENT_SET', id, 1, row, o);
        } else {
          await ensureRevision(tx, 'ASSESSMENT_SET', existing.id, existing.version, existing, o);
          // Bank pending_audio tidak pernah PUBLISHED: bila sebelumnya terbit, kembalikan ke DRAFT.
          const [row] = await tx
            .update(assessmentSets)
            .set({ ...values, ...(pending ? { status: 'DRAFT' as const } : {}), version: sql`${assessmentSets.version} + 1`, updatedAt: new Date() })
            .where(eq(assessmentSets.id, existing.id))
            .returning();
          id = row!.id;
          status = row!.status;
          await ensureRevision(tx, 'ASSESSMENT_SET', id, row!.version, row, o);
        }
      }
      if (o.publish && !pending && id && write) publishIds.push({ id, code: b.bank_code, bank: b });
      rows.push({ bank_code: b.bank_code, action, status: pending ? 'DRAFT' : status, pending_audio: pending, question_count: b.questions.length });
    }

    if (write) {
      const validPublishIds: Array<{ id: string; code: string }> = [];

      for (const p of publishIds) {
        if (isListeningBankKind(p.bank.bank_kind)) {
          const partCode = extractListeningPartCode(p.bank);
          if (!partCode) {
            hasListeningReviewFailures = true;
            lines.push(`listening_review_missing: Bank '${p.code}' tidak memiliki part_code yang valid.`);
            continue;
          }

          const candidatePaths = [
            path.join(o.dir, 'reviews', `${partCode}.review.json`),
            path.join(o.dir, '..', 'gt-listening', 'reviews', `${partCode}.review.json`),
            path.join(process.cwd(), 'content', 'gt-listening', 'reviews', `${partCode}.review.json`),
          ];
          const reviewPath = candidatePaths.find((cp) => existsSync(cp)) ?? candidatePaths[0];

          let audioBuf: Buffer | undefined;
          if (p.bank.listening_asset_code) {
            const [assetRow] = await tx
              .select({ storageKey: contentAssets.storageKey })
              .from(contentAssets)
              .where(eq(contentAssets.assetCode, p.bank.listening_asset_code))
              .limit(1);
            if (assetRow?.storageKey) {
              audioBuf = await storage.get(assetRow.storageKey).catch(() => undefined);
            }
          }

          const candidateScriptPaths = [
            path.join(o.dir, 'scripts', `${partCode}.md`),
            path.join(o.dir, '..', 'gt-listening', 'scripts', `${partCode}.md`),
            path.join(process.cwd(), 'content', 'gt-listening', 'scripts', `${partCode}.md`),
          ];
          const scriptPath = candidateScriptPaths.find((sp) => existsSync(sp));
          let scriptBuf: Buffer | undefined;
          if (scriptPath) {
            scriptBuf = await readFile(scriptPath).catch(() => undefined);
          }

          const reviewCheck = await validateListeningReview({
            reviewFilePath: reviewPath,
            expectedPartCode: partCode,
            currentAudioBuffer: audioBuf,
            currentScriptBuffer: scriptBuf,
          });

          if (!reviewCheck.valid) {
            hasListeningReviewFailures = true;
            lines.push(`${reviewCheck.code}: Bank '${p.code}' gagal publikasi: ${reviewCheck.reason}`);
            continue;
          }
        }
        validPublishIds.push(p);
      }

      const blockers: Blocker[] = [];
      for (const p of validPublishIds) {
        const r = await changeStatus(tx, 'ASSESSMENT_SET', p.id, 'PUBLISHED', { userId: o.actorUserId });
        if (!r.published) blockers.push(...r.blockers);
      }
      if (blockers.length) {
        throw new Abort({
          exitCode: 2,
          lines: ['Publikasi terhalang; tidak ada perubahan yang disimpan:', ...blockers.map((x) => `  ${x.code} ${x.entity_type} ${x.entity_id}: ${x.detail}`)],
          banks: [],
        });
      }
      for (const p of validPublishIds) {
        const row = rows.find((r) => r.bank_code === p.code);
        if (row) row.status = 'PUBLISHED';
      }
      const c = (a: BankAction) => rows.filter((r) => r.action === a).length;
      await writeAudit(tx, {
        actorUserId: o.actorUserId,
        action: 'CONTENT_IMPORTED_CLI',
        entityType: 'question_bank',
        metadata: { banks: { created: c('CREATE'), updated: c('UPDATE'), unchanged: c('NOOP') }, publish: o.publish },
      });
    }
  };

  try {
    if (o.dryRun) {
      await db.transaction(async (tx) => work(tx, false));
    } else {
      await db.transaction(async (tx) => work(tx, true));
    }
  } catch (e) {
    for (const k of copied) await storage.remove(k).catch(() => undefined);
    if (e instanceof Abort) return { ...e.outcome, lines: [...lines, ...e.outcome.lines] };
    return { exitCode: 3, lines: [...lines, `Galat teknis: ${safeErr(e).name}${safeErr(e).code ? ` (${safeErr(e).code})` : ''}`], banks: [] };
  }

  for (const r of rows) lines.push(`BANK ${r.bank_code} ${r.action} (${r.question_count} soal) ${r.pending_audio ? 'PENDING_AUDIO/DRAFT' : r.status}`);
  const n = (a: BankAction) => rows.filter((r) => r.action === a).length;
  lines.push(
    `${o.dryRun ? 'DRY-RUN' : 'OK'}: banks +${n('CREATE')} ~${n('UPDATE')} =${n('NOOP')} | published ${rows.filter((r) => r.status === 'PUBLISHED').length} | pending_audio ${rows.filter((r) => r.pending_audio).length}`,
  );
  if (hasListeningReviewFailures) {
    return { exitCode: 2, lines, banks: rows };
  }
  return { exitCode: 0, lines, banks: rows };
}
