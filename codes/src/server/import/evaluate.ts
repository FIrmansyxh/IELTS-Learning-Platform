/**
 * Evaluasi berkas impor terhadap keadaan DB saat ini (SPEC-019 I3): validasi kontrak SPEC-004, aturan silang, rencana
 * CREATE/UPDATE/NOOP per item, dan peringatan baku. Dipakai job validasi DAN job publikasi ("rencana segar").
 * Tidak pernah melakukan I/O jaringan; URL pada payload hanya diterjemahkan ke asset_code atau ditolak.
 */
import { contentAssets } from '@/db/schema';
import { QuestionSchema, type ContentIssue, type ContentPackage, type Question } from '@/contracts/content';
import type { Tx } from '../db';
import { activeAttemptSetIds, hasActiveAttempts } from '../content/active-attempts';
import { contextFromDb } from '../content/import-service';
import { loadDbState, planContentPackage, type ContentPlan, type DbState, type PlanAction } from '../content/plan';
import { canonicalJson, checkQuestion, naturalKey, parseContentPackage, sha256Hex, splitPassages, zodIssues, type SetKind } from '../content/validate';
import type { CheckedCsv, CheckedImport, CheckedJson } from './file-check';

export type EntityKindName = 'MODULE' | 'SUB_MODULE' | 'ASSESSMENT_SET' | 'QUESTION';

export interface EvalItem {
  rowNumber: number;
  entityKind: EntityKindName;
  entityCode: string | null;
  status: 'VALID' | 'INVALID';
  action: PlanAction | null;
  errors: ContentIssue[];
  contentHash: string | null;
  payload: unknown;
}

export interface CsvSetPlan {
  key: string;
  setId: string;
  existing: Question[];
  changes: Array<{ rowNumber: number; question: Question; action: PlanAction }>;
}

export interface Evaluation {
  items: EvalItem[];
  /** Galat tingkat berkas (di luar item mana pun) -> batch FAILED. */
  fileError?: { code: string; message: string };
  jsonPlan?: ContentPlan;
  pkg?: ContentPackage;
  csvPlans?: CsvSetPlan[];
}

const err = (path: string, code: string, message: string): ContentIssue => ({ path, code, message, severity: 'error' });
const warn = (path: string, code: string, message: string): ContentIssue => ({ path, code, message, severity: 'warning' });
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

// ----------------------------------------------------------------------------------- JSON
const ITEM_PATH_RE = /^(modules|sub_modules|assessment_sets)\[(\d+)\]/;

interface RawItemRef {
  list: 'modules' | 'sub_modules' | 'assessment_sets';
  index: number;
  rowNumber: number;
  kind: EntityKindName;
  code: string | null;
  raw: unknown;
}

function rawRefs(root: Record<string, unknown>): RawItemRef[] {
  const out: RawItemRef[] = [];
  let row = 1;
  const add = (list: RawItemRef['list'], kind: EntityKindName, codeOf: (o: Record<string, unknown>) => string | null) => {
    const arr = root[list];
    if (!Array.isArray(arr)) return;
    arr.forEach((raw, index) => {
      const o = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      out.push({ list, index, rowNumber: row++, kind, code: codeOf(o), raw });
    });
  };
  add('modules', 'MODULE', (o) => str(o.module_code));
  add('sub_modules', 'SUB_MODULE', (o) => str(o.sub_module_code));
  add('assessment_sets', 'ASSESSMENT_SET', (o) => {
    const t = str(o.set_type);
    if (!t) return null;
    try {
      return naturalKey({
        type: t as SetKind,
        module: str(o.module_code) ?? undefined,
        tier: typeof o.tier_number === 'number' ? o.tier_number : undefined,
        skill: str(o.skill_category) ?? undefined,
      });
    } catch {
      return null;
    }
  });
  return out;
}

interface AssetInfo {
  rights: string;
  kind: string;
}

export async function evaluateJson(tx: Tx, checked: CheckedJson, state?: DbState): Promise<Evaluation> {
  const refs = rawRefs(checked.json);
  const ctx = await contextFromDb(tx);
  const parsed = parseContentPackage(checked.json, ctx);
  const issues = [...(parsed.ok ? [] : parsed.errors), ...parsed.warnings];

  const byRef = new Map<string, RawItemRef>(refs.map((r) => [`${r.list}[${r.index}]`, r]));
  const perItem = new Map<number, ContentIssue[]>();
  const push = (row: number, i: ContentIssue) => perItem.set(row, [...(perItem.get(row) ?? []), i]);
  const fileLevel: ContentIssue[] = [];
  for (const i of issues) {
    const m = ITEM_PATH_RE.exec(i.path);
    const ref = m ? byRef.get(`${m[1]}[${m[2]}]`) : undefined;
    if (ref) push(ref.rowNumber, i);
    else if (i.severity === 'error') fileLevel.push(i);
  }
  if (fileLevel.length) {
    const first = fileLevel[0]!;
    return { items: [], fileError: { code: first.code.toUpperCase(), message: `${first.path}: ${first.message}` } };
  }

  let plan: ContentPlan | undefined;
  const actionByRow = new Map<number, PlanAction>();
  const hashByRow = new Map<number, string>();
  if (parsed.ok) {
    const pkg = parsed.data;
    const db = state ?? (await loadDbState(tx));
    plan = await planContentPackage(tx, pkg, db);
    const planBy = new Map(plan.items.map((p) => [`${p.entityKind}:${p.entityCode}`, p]));
    const assets = new Map<string, AssetInfo & { ref: string | null }>();
    for (const a of await tx.select({ code: contentAssets.assetCode, ref: contentAssets.externalRef, rights: contentAssets.rightsStatus, kind: contentAssets.kind }).from(contentAssets)) {
      if (a.code) assets.set(a.code, { rights: a.rights, kind: a.kind, ref: a.ref });
      if (a.kind === 'VIDEO_EMBED' && a.ref) assets.set(`video:${a.ref}`, { rights: a.rights, kind: a.kind, ref: a.ref });
    }
    const assetWarn = (row: number, code: string, path: string) => {
      const a = assets.get(code);
      if (a?.rights === 'UNVERIFIED') push(row, warn(path, 'asset_unverified', `Aset '${code}' belum diverifikasi; menghalangi target PUBLISHED.`));
    };
    // F-20-04: definisi tunggal dengan kurasi K3 (hidup saja; set induk/anak Boss ikut diperhitungkan).
    const activeAttempts = (setId: string) => hasActiveAttempts(tx, setId);

    for (const ref of refs) {
      const row = ref.rowNumber;
      if (ref.list === 'modules') {
        const m = pkg.modules![ref.index]!;
        const p = planBy.get(`MODULE:${m.module_code}`);
        if (p) {
          actionByRow.set(row, p.action);
          hashByRow.set(row, p.contentHash);
        }
        for (const e of plan.errors) {
          const mm = ITEM_PATH_RE.exec(e.path);
          if (mm && mm[1] === 'modules' && Number(mm[2]) === ref.index) push(row, e);
        }
      } else if (ref.list === 'sub_modules') {
        const s = pkg.sub_modules![ref.index]!;
        const p = planBy.get(`SUB_MODULE:${s.sub_module_code}`);
        const drill = s.active_drill ? planBy.get(`ASSESSMENT_SET:${naturalKey({ type: 'ACTIVE_DRILL', sub: s.sub_module_code })}`) : undefined;
        const acts = [p?.action, drill?.action].filter(Boolean) as PlanAction[];
        const act: PlanAction = acts.every((a) => a === 'NOOP') ? 'NOOP' : p?.action === 'CREATE' ? 'CREATE' : 'UPDATE';
        actionByRow.set(row, act);
        hashByRow.set(row, sha256Hex(canonicalJson([p?.contentHash ?? null, drill?.contentHash ?? null])));
        s.materials?.videos?.forEach((v, j) => {
          const path = `sub_modules[${ref.index}].materials.videos[${j}]`;
          const ex = assets.get(`video:${v.video_id}`);
          if (!ex) push(row, warn(path, 'video_unverified', 'Video baru akan dibuat dengan status belum diverifikasi.'));
          else if (ex.rights === 'UNVERIFIED') push(row, warn(path, 'asset_unverified', `Video '${v.video_id}' belum diverifikasi.`));
        });
        s.materials?.slides?.forEach((x, j) => x.asset_code && assetWarn(row, x.asset_code, `sub_modules[${ref.index}].materials.slides[${j}]`));
        s.materials?.attachments?.forEach((x, j) => x.asset_code && assetWarn(row, x.asset_code, `sub_modules[${ref.index}].materials.attachments[${j}]`));
        if (s.active_drill?.listening_asset_code) assetWarn(row, s.active_drill.listening_asset_code, `sub_modules[${ref.index}].active_drill.listening_asset_code`);
        s.active_drill?.questions.forEach((q, j) => {
          if (q.question_type === 'WRITING_TASK' && q.stimulus_asset_code) assetWarn(row, q.stimulus_asset_code, `sub_modules[${ref.index}].active_drill.questions[${j}].stimulus_asset_code`);
        });
        if (s.origin === 'OPEN_LICENSED_ADAPTED' && !s.attribution_text) {
          push(row, warn(`sub_modules[${ref.index}].attribution_text`, 'attribution_recommended', 'Atribusi sebaiknya diisi untuk materi berlisensi terbuka.'));
        }
        if (drill && drill.action === 'UPDATE') {
          const existing = db.sets.get(naturalKey({ type: 'ACTIVE_DRILL', sub: s.sub_module_code }));
          if (existing && (await activeAttempts(existing.id))) {
            push(row, err(`sub_modules[${ref.index}].active_drill`, 'set_has_active_attempts', 'Set sedang dikerjakan pengguna (percobaan masih berjalan); ubah setelah selesai.'));
          }
        }
      } else {
        const st = pkg.assessment_sets![ref.index]!;
        const key = ref.code ?? '';
        const p = planBy.get(`ASSESSMENT_SET:${key}`);
        if (p) {
          actionByRow.set(row, p.action);
          hashByRow.set(row, p.contentHash);
        }
        if (st.listening_asset_code) assetWarn(row, st.listening_asset_code, `assessment_sets[${ref.index}].listening_asset_code`);
        st.questions.forEach((q, j) => {
          if (q.question_type === 'WRITING_TASK' && q.stimulus_asset_code) assetWarn(row, q.stimulus_asset_code, `assessment_sets[${ref.index}].questions[${j}].stimulus_asset_code`);
        });
        if (st.origin === 'OPEN_LICENSED_ADAPTED' && !st.attribution_text) {
          push(row, warn(`assessment_sets[${ref.index}].attribution_text`, 'attribution_recommended', 'Atribusi sebaiknya diisi untuk materi berlisensi terbuka.'));
        }
        if (p?.action === 'UPDATE') {
          const existing = db.sets.get(key);
          if (existing && (await activeAttempts(existing.id))) {
            push(row, err(`assessment_sets[${ref.index}]`, 'set_has_active_attempts', 'Set sedang dikerjakan pengguna (percobaan masih berjalan); ubah setelah selesai.'));
          }
        }
      }
    }
    for (const [row, act] of actionByRow) {
      if (act === 'NOOP') push(row, warn('$', 'noop_item', 'Tidak ada perubahan dibanding data saat ini.'));
    }
  }

  const items: EvalItem[] = refs.map((r) => {
    const errors = perItem.get(r.rowNumber) ?? [];
    const invalid = errors.some((e) => e.severity === 'error');
    const normalized = parsed.ok ? (parsed.data[r.list] as unknown[])[r.index] : r.raw;
    return {
      rowNumber: r.rowNumber,
      entityKind: r.kind,
      entityCode: r.code,
      status: invalid ? 'INVALID' : 'VALID',
      action: invalid || !parsed.ok ? null : (actionByRow.get(r.rowNumber) ?? null),
      errors,
      contentHash: invalid ? null : (hashByRow.get(r.rowNumber) ?? null),
      payload: normalized ?? null,
    };
  });
  if (items.length === 0) return { items, fileError: { code: 'PACKAGE_EMPTY', message: 'Paket harus memuat minimal satu item.' } };
  // Paket valid secara kontrak tetapi ada item yang gagal pemeriksaan silang DB (mis. tier_conflict): paket tidak diterapkan.
  const hasItemErrors = items.some((i) => i.status === 'INVALID');
  return { items, jsonPlan: hasItemErrors ? undefined : plan, pkg: parsed.ok && !hasItemErrors ? parsed.data : undefined };
}

// ----------------------------------------------------------------------------------- CSV
const SET_TYPES = ['ACTIVE_DRILL', 'SKIP_MODULE_TEST', 'SKIP_TIER_TEST', 'BOSS_SECTION', 'PLACEMENT_TEST'] as const;
const CSV_TYPES = ['MCQ_SINGLE', 'MCQ_MULTI', 'TFNG', 'YNNG', 'FILL_IN_BLANK', 'SHORT_ANSWER'] as const;
const FORMULA_RE = /^[=@\t\r]/;
const INT_FIELDS = ['points', 'target_time_ms', 'difficulty', 'passage_no', 'section_no', 'max_words'] as const;

function scopeToKey(setType: string, scope: string): string | null {
  switch (setType) {
    case 'ACTIVE_DRILL':
      return /^[1-4]\.\d{1,2}\.\d{1,2}$/.test(scope) ? `ACTIVE_DRILL:${scope}` : null;
    case 'SKIP_MODULE_TEST':
      return /^[1-4]\.\d{1,2}$/.test(scope) ? `SKIP_MODULE_TEST:${scope}` : null;
    case 'SKIP_TIER_TEST':
      return /^[1-4]$/.test(scope) ? `SKIP_TIER_TEST:${scope}` : null;
    case 'BOSS_SECTION':
      return /^[1-4]:(LISTENING|READING|WRITING|SPEAKING)$/.test(scope) ? `BOSS_SECTION:${scope}` : null;
    case 'PLACEMENT_TEST':
      return scope === 'PLACEMENT' ? 'PLACEMENT_TEST:PLACEMENT' : null;
    default:
      return null;
  }
}

const splitList = (v: string): string[] => (v.trim() === '' ? [] : v.split(' || ').map((x) => x.normalize('NFC').trim()));

export async function evaluateCsv(tx: Tx, checked: CheckedCsv, state?: DbState): Promise<Evaluation> {
  const db = state ?? (await loadDbState(tx));
  const items: EvalItem[] = [];
  const seen = new Set<string>();
  const bySet = new Map<string, CsvSetPlan>();
  const rowSet = new Map<number, string>();

  for (const r of checked.rows) {
    const errors: ContentIssue[] = [];
    const rec: Record<string, string> = {};
    checked.headers.forEach((h, i) => (rec[h] = (r.cells[i] ?? '').normalize('NFC')));
    if (r.cells.length !== checked.headers.length) errors.push(err('$', 'column_count_mismatch', `Baris memiliki ${r.cells.length} kolom, header ${checked.headers.length}.`));
    for (const h of checked.headers) {
      if (FORMULA_RE.test(r.cells[checked.headers.indexOf(h)] ?? '')) errors.push(err(h, 'formula_injection', 'Sel diawali = atau @ atau tab/CR (berisiko formula spreadsheet).'));
    }
    const setType = rec.set_type?.trim() ?? '';
    const scope = rec.scope_code?.trim() ?? '';
    const qid = rec.question_id?.trim() ?? '';
    const entityCode = `${setType}:${scope}:${qid}`.slice(0, 160);

    let key: string | null = null;
    if (!(SET_TYPES as readonly string[]).includes(setType)) errors.push(err('set_type', 'invalid_enum', 'set_type tidak dikenal untuk CSV.'));
    else {
      key = scopeToKey(setType, scope);
      if (!key) errors.push(err('scope_code', 'scope_code_invalid', 'scope_code tidak sesuai set_type.'));
      else if (!db.sets.has(key)) errors.push(err('scope_code', 'set_not_found', `Set '${key}' belum ada; set baru hanya lewat JSON.`));
    }
    const qtype = rec.question_type?.trim() ?? '';
    if (!(CSV_TYPES as readonly string[]).includes(qtype)) errors.push(err('question_type', 'question_type_unsupported', 'Tipe soal tidak didukung CSV.'));

    const obj: Record<string, unknown> = {
      question_id: qid,
      question_type: qtype,
      skill: rec.skill?.trim(),
      prompt: rec.prompt?.trim(),
      explanation_id: rec.explanation_id?.trim(),
      correct_answers: splitList(rec.correct_answers ?? ''),
    };
    for (const f of INT_FIELDS) {
      const v = (rec[f] ?? '').trim();
      if (v === '') continue;
      if (!/^\d{1,9}$/.test(v)) errors.push(err(f, 'invalid_number', `${f} harus bilangan bulat.`));
      else obj[f] = Number(v);
    }
    if (qtype === 'MCQ_SINGLE' || qtype === 'MCQ_MULTI') obj.options = splitList(rec.options ?? '');
    else if ((rec.options ?? '').trim() !== '') errors.push(err('options', 'options_not_allowed', 'options hanya untuk MCQ_SINGLE/MCQ_MULTI.'));
    if (qtype !== 'FILL_IN_BLANK' && qtype !== 'SHORT_ANSWER' && 'max_words' in obj) errors.push(err('max_words', 'max_words_not_allowed', 'max_words hanya untuk FILL_IN_BLANK/SHORT_ANSWER.'));

    let q: Question | null = null;
    if (!errors.some((e) => e.severity === 'error' && e.code !== 'set_not_found')) {
      const p = QuestionSchema.safeParse(obj);
      if (!p.success) errors.push(...zodIssues(p.error));
      else {
        q = p.data;
        checkQuestion(q, 'question', errors, { placement: setType === 'PLACEMENT_TEST' });
        errors.forEach((e) => (e.path = e.path.replace(/^question\.?/, '') || '$'));
      }
    }
    if (key && q) {
      const dupKey = `${key}|${qid}`;
      if (seen.has(dupKey)) errors.push(err('question_id', 'duplicate_item', 'question_id ganda untuk set yang sama dalam berkas.'));
      seen.add(dupKey);
      const set = db.sets.get(key);
      if (q.passage_no !== undefined) {
        const parts = set?.readingPassageMarkdown ? splitPassages(set.readingPassageMarkdown).length : 0;
        if (!parts || q.passage_no > parts) errors.push(err('passage_no', 'passage_out_of_range', 'passage_no di luar jumlah bagian set.'));
      }
    }

    const invalid = errors.some((e) => e.severity === 'error');
    let action: PlanAction | null = null;
    let hash: string | null = null;
    if (!invalid && key && q) {
      const set = db.sets.get(key)!;
      let plan = bySet.get(key);
      if (!plan) {
        plan = { key, setId: set.id, existing: (set.questionsJson as Question[]) ?? [], changes: [] };
        bySet.set(key, plan);
      }
      const cur = plan.existing.find((x) => x.question_id === q!.question_id);
      hash = sha256Hex(canonicalJson(q));
      action = !cur ? 'CREATE' : sha256Hex(canonicalJson(cur)) === hash ? 'NOOP' : 'UPDATE';
      plan.changes.push({ rowNumber: r.lineNo, question: q, action });
      rowSet.set(r.lineNo, key);
      if (action === 'NOOP') errors.push(warn('$', 'noop_item', 'Tidak ada perubahan dibanding data saat ini.'));
    }
    items.push({
      rowNumber: r.lineNo,
      entityKind: 'QUESTION',
      entityCode,
      status: invalid ? 'INVALID' : 'VALID',
      action,
      errors,
      contentHash: hash,
      payload: { set_type: setType, scope_code: scope, question: q ?? obj },
    });
  }

  // set dengan percobaan IN_PROGRESS tidak boleh diubah
  const changedSets = [...bySet.values()].filter((p) => p.changes.some((c) => c.action !== 'NOOP'));
  if (changedSets.length) {
    const busyIds = await activeAttemptSetIds(tx, changedSets.map((p) => p.setId));
    for (const p of changedSets.filter((x) => busyIds.has(x.setId))) {
      for (const c of p.changes.filter((x) => x.action !== 'NOOP')) {
        const it = items.find((i) => i.rowNumber === c.rowNumber)!;
        it.errors.push(err('scope_code', 'set_has_active_attempts', 'Set sedang dikerjakan pengguna (percobaan masih berjalan).'));
        it.status = 'INVALID';
        it.action = null;
        it.contentHash = null;
      }
    }
  }
  if (items.length === 0) return { items, fileError: { code: 'PACKAGE_EMPTY', message: 'CSV tidak memuat baris data.' } };
  const hasErrors = items.some((i) => i.status === 'INVALID');
  return { items, csvPlans: hasErrors ? undefined : [...bySet.values()] };
}

export async function evaluate(tx: Tx, checked: CheckedImport): Promise<Evaluation> {
  return checked.format === 'JSON' ? evaluateJson(tx, checked) : evaluateCsv(tx, checked);
}

/** Hitungan ringkasan batch dari item hasil evaluasi. */
export function summarizeItems(items: EvalItem[]) {
  const by_kind: Record<string, number> = {};
  let warnings = 0;
  let noop = 0;
  for (const i of items) {
    by_kind[i.entityKind] = (by_kind[i.entityKind] ?? 0) + 1;
    if (i.action === 'NOOP') noop++;
    // noop_item bersifat informatif: tidak menuntut pengakuan peringatan.
    warnings += i.errors.filter((e) => e.severity === 'warning' && e.code !== 'noop_item').length;
  }
  const invalid = items.filter((i) => i.status === 'INVALID').length;
  const has_ai_generated = items.some(
    (i) => (i.entityKind === 'SUB_MODULE' || i.entityKind === 'ASSESSMENT_SET') && i.action !== 'NOOP' && (i.payload as { origin?: unknown } | null)?.origin === 'AI_GENERATED_REVIEWED',
  );
  return { total: items.length, valid: items.length - invalid, invalid, warnings, noop, by_kind, has_ai_generated };
}
