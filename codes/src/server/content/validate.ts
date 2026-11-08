import { createHash } from 'node:crypto';
import type { z } from 'zod';
import {
  AI_TASK_TYPES,
  AssetManifestSchema,
  ContentPackageSchema,
  OBJECTIVE_TYPES,
  type AssetManifest,
  type AssessmentSetItemType,
  type ContentIssue,
  type ContentPackage,
  type Question,
  type SubModuleItemType,
} from '@/contracts/content';
import { duplicateLabels, MAX_PASSAGES, parsePassages, splitPassages } from './passages';
import { SUB_MODULE_SEEDS } from './curriculum-structure';

export type { ContentIssue } from '@/contracts/content';

export interface SourceInfo {
  licenseType: string;
  shareAlike: boolean;
  mayStoreCopy: boolean;
}
export interface SubModuleInfo {
  tier: number;
  exam?: string;
  hasBaseMaterials?: boolean;
}
export interface ParseContext {
  /** content_sources.code -> info. Bila tidak ada, pemeriksaan sumber dilewati. */
  sources?: Map<string, SourceInfo>;
  /** modules yang sudah ada (module_code -> tier, skill). Bila tidak ada, pemeriksaan modul dilewati. */
  modules?: Map<string, { tier: number; skill: string }>;
  /** sub_modules yang sudah ada (sub_module_code -> info). */
  subModules?: Map<string, SubModuleInfo>;
  /** content_assets.asset_code yang sudah ada -> kind. Bila tidak ada, pemeriksaan aset dilewati. */
  assets?: Map<string, { kind: string }>;
  /** Manifest paket (kode di manifest dianggap ada). */
  manifest?: AssetManifest;
}

export type ParseResult =
  | { ok: true; data: ContentPackage; warnings: ContentIssue[] }
  | { ok: false; errors: ContentIssue[]; warnings: ContentIssue[] };

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 10;
const MAX_ITEMS = 2000;

const err = (path: string, code: string, message: string): ContentIssue => ({ path, code, message, severity: 'error' });
const warn = (path: string, code: string, message: string): ContentIssue => ({ path, code, message, severity: 'warning' });

const MESSAGES: Record<string, string> = {
  unrecognized_key: 'Field tidak dikenal.',
  forbidden_key: 'Kunci terlarang.',
  max_depth: 'Kedalaman JSON melebihi 10.',
  control_char: 'Karakter kontrol tidak diizinkan.',
  placeholder_video: 'video_id masih placeholder (YOUTUBE_VIDEO_ID).',
  invalid_video_id: 'video_id harus 11 karakter [A-Za-z0-9_-].',
  invalid_type: 'Tipe data tidak sesuai.',
  invalid_value: 'Nilai tidak valid.',
  invalid_question_id: 'question_id harus berformat Q-xxx (maks 40 karakter).',
  invalid_asset_code: 'asset_code tidak valid.',
  invalid_module_code: 'module_code tidak valid.',
  invalid_sub_module_code: 'sub_module_code tidak valid.',
  too_small: 'Nilai/ukuran terlalu kecil.',
  too_big: 'Nilai/ukuran terlalu besar.',
};

/** Path array -> `a[0].b`. */
export function pathString(p: ReadonlyArray<PropertyKey>): string {
  let s = '';
  for (const seg of p) s += typeof seg === 'number' ? `[${seg}]` : s ? `.${String(seg)}` : String(seg);
  return s;
}

export function zodIssues(e: z.ZodError): ContentIssue[] {
  const out: ContentIssue[] = [];
  for (const i of e.issues) {
    const base = pathString(i.path);
    if (i.code === 'unrecognized_keys') {
      for (const k of i.keys) out.push(err(base ? `${base}.${k}` : k, 'unrecognized_key', MESSAGES.unrecognized_key!));
      continue;
    }
    let code: string;
    if (i.code === 'custom') code = i.message;
    else if (i.code === 'too_small') code = 'too_small';
    else if (i.code === 'too_big') code = 'too_big';
    else if (i.code === 'invalid_type') code = 'invalid_type';
    else if (i.code === 'invalid_union') code = base.endsWith('question_type') ? 'invalid_question_type' : 'invalid_value';
    else if (i.code === 'invalid_format' || i.code === 'invalid_value') code = i.message in MESSAGES ? i.message : 'invalid_value';
    else code = 'invalid_value';
    if (i.code !== 'custom' && i.message in MESSAGES && !['too_small', 'too_big', 'invalid_type'].includes(i.message)) code = i.message;
    out.push(err(base, code, MESSAGES[code] ?? i.message));
  }
  return out;
}

/** Normalisasi string (NFC + trim), tolak kunci terlarang/kedalaman/karakter kontrol. Mengembalikan salinan aman. */
export function sanitizeRaw(raw: unknown, issues: ContentIssue[]): unknown {
  const walk = (v: unknown, path: string, depth: number): unknown => {
    if (depth > MAX_DEPTH) {
      issues.push(err(path, 'max_depth', MESSAGES.max_depth!));
      return null;
    }
    if (typeof v === 'string') {
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v)) issues.push(err(path, 'control_char', MESSAGES.control_char!));
      return v.normalize('NFC').trim();
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`, depth + 1));
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v)) {
        const p = path ? `${path}.${k}` : k;
        if (FORBIDDEN_KEYS.has(k)) {
          issues.push(err(p, 'forbidden_key', MESSAGES.forbidden_key!));
          continue;
        }
        Object.defineProperty(out, k, {
          value: walk((v as Record<string, unknown>)[k], p, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return out;
    }
    return v;
  };
  return walk(raw, '', 1);
}

/** Hapus blok kode berpagar dan kode inline sebelum memeriksa HTML mentah / skema tautan. */
function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '').replace(/`[^`\n]*`/g, '');
}

export function checkMarkdown(md: string, path: string, out: ContentIssue[]): void {
  const body = stripCode(md);
  if (/<[A-Za-z/!]/.test(body)) out.push(err(path, 'raw_html_not_allowed', 'HTML mentah tidak diizinkan di luar blok kode.'));
  if (/\]\(\s*(javascript|data|vbscript):/i.test(body) || /^\s*\[[^\]]+\]:\s*(javascript|data|vbscript):/im.test(body)) {
    out.push(err(path, 'unsafe_link_scheme', 'Skema tautan javascript:/data: tidak diizinkan.'));
  }
}

export function canonicalJson(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x !== null && typeof x === 'object') {
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>)
          .filter(([, val]) => val !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, norm(val)]),
      );
    }
    return x;
  };
  return JSON.stringify(norm(v));
}
export const sha256Hex = (s: string | Buffer | Uint8Array) => createHash('sha256').update(s).digest('hex');

/** D9: `/storage/tier2/slides/x.webp` -> `tier2/slides/x`. */
export function urlToAssetCode(url: string): string | null {
  if (!url.startsWith('/storage/')) return null;
  const rest = url.slice('/storage/'.length);
  const dot = rest.lastIndexOf('.');
  const slash = rest.lastIndexOf('/');
  return dot > slash ? rest.slice(0, dot) : rest;
}

// ---------------------------------------------------------------- Question cross rules
const TFNG = ['True', 'False', 'Not Given'];
const YNNG = ['Yes', 'No', 'Not Given'];

export function checkQuestion(q: Question, path: string, out: ContentIssue[], opts: { placement: boolean }): void {
  const dup = (arr: unknown[]) => new Set(arr.map(String)).size !== arr.length;
  switch (q.question_type) {
    case 'MCQ_SINGLE':
    case 'MCQ_MULTI': {
      if (dup(q.options)) out.push(err(`${path}.options`, 'duplicate_options', 'Opsi harus unik.'));
      q.correct_answers.forEach((a, i) => {
        if (!q.options.includes(a)) out.push(err(`${path}.correct_answers[${i}]`, 'answer_not_in_options', 'Jawaban benar harus salah satu opsi.'));
      });
      if (q.question_type === 'MCQ_MULTI') {
        if (dup(q.correct_answers)) out.push(err(`${path}.correct_answers`, 'duplicate_answers', 'Jawaban benar harus unik.'));
        if (q.correct_answers.length > q.options.length - 1) {
          out.push(err(`${path}.correct_answers`, 'too_many_answers', 'Jawaban benar harus kurang dari jumlah opsi.'));
        }
      }
      break;
    }
    case 'TFNG':
      if (!TFNG.includes(q.correct_answers[0]!)) out.push(err(`${path}.correct_answers[0]`, 'invalid_tfng_answer', 'Nilai harus True, False, atau Not Given.'));
      break;
    case 'YNNG':
      if (!YNNG.includes(q.correct_answers[0]!)) out.push(err(`${path}.correct_answers[0]`, 'invalid_ynng_answer', 'Nilai harus Yes, No, atau Not Given.'));
      break;
    case 'MATCHING_DROPDOWN':
    case 'MATCHING_DRAG': {
      const { left, right, allow_reuse } = q.matching;
      if (dup(right)) out.push(err(`${path}.matching.right`, 'duplicate_options', 'Daftar kanan harus unik.'));
      if (q.correct_answers.length !== left.length) {
        out.push(err(`${path}.correct_answers`, 'answers_length_mismatch', 'Jumlah jawaban harus sama dengan jumlah butir kiri.'));
      }
      q.correct_answers.forEach((a, i) => {
        if (a >= right.length) out.push(err(`${path}.correct_answers[${i}]`, 'index_out_of_range', 'Indeks di luar daftar kanan.'));
      });
      if (!allow_reuse) {
        if (dup(q.correct_answers)) out.push(err(`${path}.correct_answers`, 'duplicate_answers', 'Indeks tidak boleh berulang tanpa allow_reuse.'));
        if (right.length < left.length) out.push(err(`${path}.matching.right`, 'right_too_short', 'Daftar kanan harus >= daftar kiri tanpa allow_reuse.'));
      }
      if (q.points !== left.length) out.push(warn(`${path}.points`, 'points_mismatch', 'points sebaiknya sama dengan jumlah butir.'));
      break;
    }
    case 'SENTENCE_REORDER':
      if (new Set(q.segments).size === 1) out.push(err(`${path}.segments`, 'segments_all_identical', 'Segmen tidak boleh seluruhnya identik.'));
      break;
    case 'ERROR_RECOGNITION':
      if (dup(q.correct_answers)) out.push(err(`${path}.correct_answers`, 'duplicate_answers', 'Indeks harus unik.'));
      q.correct_answers.forEach((a, i) => {
        if (a >= q.tokens.length) out.push(err(`${path}.correct_answers[${i}]`, 'index_out_of_range', 'Indeks di luar token.'));
      });
      break;
    default:
      break;
  }
  if (opts.placement) {
    if (q.difficulty === undefined) out.push(err(`${path}.difficulty`, 'difficulty_required', 'difficulty wajib pada Placement Test.'));
    if (AI_TASK_TYPES.includes(q.question_type)) out.push(err(`${path}.question_type`, 'ai_task_not_allowed', 'Soal Writing/Speaking tidak diizinkan di Placement.'));
  }
}

/** Isi nilai bawaan yang bergantung tipe (tidak dapat dinyatakan sebagai default Zod). */
function applyQuestionDefaults(q: Question): void {
  if (q.question_type === 'WRITING_TASK') {
    q.min_words ??= q.task_kind === 'TASK1' ? 150 : 250;
    q.time_limit_minutes ??= q.task_kind === 'TASK1' ? 20 : 40;
  } else if (q.question_type === 'SPEAKING_TASK') {
    q.prep_seconds ??= q.part === 2 ? 60 : 0;
    q.record_seconds ??= q.part === 2 ? 120 : 45;
  }
}

function checkQuestionSet(
  questions: Question[],
  path: string,
  out: ContentIssue[],
  o: { placement: boolean; passageText?: string; seenIds?: Set<string> },
): void {
  const seen = o.seenIds ?? new Set<string>();
  const parts = o.passageText ? splitPassages(o.passageText).length : 0;
  questions.forEach((q, i) => {
    const p = `${path}[${i}]`;
    applyQuestionDefaults(q);
    if (seen.has(q.question_id)) out.push(err(`${p}.question_id`, 'duplicate_question_id', 'question_id ganda.'));
    seen.add(q.question_id);
    checkQuestion(q, p, out, { placement: o.placement });
    if (q.passage_no !== undefined) {
      if (!o.passageText) out.push(err(`${p}.passage_no`, 'passage_out_of_range', 'Set tidak memiliki reading_passage_markdown.'));
      else if (q.passage_no > parts) out.push(err(`${p}.passage_no`, 'passage_out_of_range', 'passage_no melebihi jumlah bagian.'));
    }
  });
}

function checkPassageText(md: string | undefined, path: string, out: ContentIssue[]): void {
  if (!md) return;
  checkMarkdown(md, path, out);
  if (md.split(/\r?\n===PASSAGE===\r?\n/).length > MAX_PASSAGES) out.push(err(path, 'too_many_passages', 'Maksimal 3 bagian.'));
  for (const p of parsePassages(md)) {
    for (const l of duplicateLabels(p)) out.push(err(path, 'duplicate_paragraph_label', `Label paragraf [${l}] ganda pada bagian ${p.index}.`));
  }
}

// ---------------------------------------------------------------- Package-level
export type SetKind = 'ACTIVE_DRILL' | AssessmentSetItemType['set_type'];

/** Kunci alami set (dipakai plan/apply). */
export function naturalKey(set: { type: SetKind; sub?: string; module?: string; tier?: number; skill?: string }): string {
  switch (set.type) {
    case 'ACTIVE_DRILL':
      return `ACTIVE_DRILL:${set.sub}`;
    case 'SKIP_MODULE_TEST':
      return `SKIP_MODULE_TEST:${set.module}`;
    case 'SKIP_TIER_TEST':
      return `SKIP_TIER_TEST:${set.tier}`;
    case 'TIER_BOSS_EXAM':
      return `TIER_BOSS_EXAM:${set.tier}`;
    case 'BOSS_SECTION':
      return `BOSS_SECTION:${set.tier}:${set.skill}`;
    case 'PLACEMENT_TEST':
      return 'PLACEMENT_TEST:PLACEMENT';
  }
}

export function setKeyOf(s: AssessmentSetItemType): string {
  return naturalKey({ type: s.set_type, module: s.module_code, tier: s.tier_number, skill: s.skill_category });
}

export function parseContentPackage(raw: unknown, ctx: ParseContext = {}): ParseResult {
  const errors: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];
  const clean = sanitizeRaw(raw, errors);
  const parsed = ContentPackageSchema.safeParse(clean);
  if (!parsed.success) {
    errors.push(...zodIssues(parsed.error));
    return { ok: false, errors, warnings };
  }
  if (errors.length) return { ok: false, errors, warnings };
  const pkg = parsed.data;
  const v10 = pkg.contract_version === '1.0';

  const mods = pkg.modules ?? [];
  const subs = pkg.sub_modules ?? [];
  const sets = pkg.assessment_sets ?? [];
  const tracks = pkg.learning_tracks ?? [];
  if (mods.length + subs.length + sets.length + tracks.length === 0 && (ctx.manifest?.assets?.length ?? 0) === 0) errors.push(err('$', 'package_empty', 'Paket harus memuat minimal satu item.'));
  if (mods.length + subs.length + sets.length + tracks.length > MAX_ITEMS) errors.push(err('$', 'package_too_large', 'Paket melebihi 2.000 item.'));

  const assetKinds = new Map<string, string>();
  for (const [c, a] of ctx.assets ?? []) assetKinds.set(c, a.kind);
  for (const a of ctx.manifest?.assets ?? []) assetKinds.set(a.asset_code, a.kind);
  const checkAssets = ctx.assets !== undefined || ctx.manifest !== undefined;

  const requireAsset = (code: string, path: string, expectKind?: string) => {
    if (!checkAssets) return;
    const kind = assetKinds.get(code);
    if (kind === undefined) errors.push(err(path, 'asset_not_found', `Aset '${code}' tidak ditemukan di DB maupun manifest.`));
    else if (expectKind && kind !== expectKind) errors.push(err(path, 'asset_kind_mismatch', `Aset '${code}' bertipe ${kind}, diharapkan ${expectKind}.`));
  };

  // modul yang dikenal: DB + paket
  const knownModules = new Map<string, { tier: number; skill: string }>(ctx.modules ?? []);
  const seenModules = new Set<string>();
  mods.forEach((m, i) => {
    const p = `modules[${i}]`;
    if (Number(m.module_code.split('.')[0]) !== m.tier_number) errors.push(err(`${p}.module_code`, 'tier_mismatch', 'Angka depan module_code harus sama dengan tier_number.'));
    if (seenModules.has(m.module_code)) errors.push(err(`${p}.module_code`, 'duplicate_item', 'module_code ganda dalam paket.'));
    seenModules.add(m.module_code);
    const existing = ctx.modules?.get(m.module_code);
    if (existing && existing.skill !== m.module_category) errors.push(err(`${p}.module_category`, 'category_mismatch', 'module_category berbeda dengan modul yang sudah ada.'));
    knownModules.set(m.module_code, { tier: m.tier_number, skill: m.module_category });
    m.order_index ??= Number(m.module_code.split('.')[1]);
  });

  const checkProvenance = (it: { origin?: string; source_code?: string; attribution_text?: string }, p: string) => {
    if (it.origin === undefined) {
      if (v10) it.origin = 'ORIGINAL_AUTHORED';
      else errors.push(err(`${p}.origin`, 'origin_required', 'origin wajib pada kontrak 1.1.'));
    }
    if (it.origin === 'OPEN_LICENSED_ADAPTED' && !it.source_code) errors.push(err(`${p}.source_code`, 'source_required', 'source_code wajib untuk OPEN_LICENSED_ADAPTED.'));
    if (it.source_code && ctx.sources) {
      const s = ctx.sources.get(it.source_code);
      if (!s) errors.push(err(`${p}.source_code`, 'source_not_found', `Sumber '${it.source_code}' tidak dikenal.`));
      else {
        if (s.licenseType === 'LINK_ONLY_COPYRIGHTED' || !s.mayStoreCopy) errors.push(err(`${p}.source_code`, 'source_not_storable', 'Sumber ini tidak boleh disalin ke platform.'));
        if ((s.shareAlike || s.licenseType.startsWith('CC_BY')) && !it.attribution_text) errors.push(err(`${p}.attribution_text`, 'attribution_required', 'Atribusi wajib untuk lisensi CC BY / share-alike.'));
      }
    }
  };

  const knownSubModules = new Map<string, SubModuleInfo>();
  if (ctx.subModules) {
    for (const [k, v] of ctx.subModules.entries()) knownSubModules.set(k, { ...v });
  } else {
    for (const sm of SUB_MODULE_SEEDS) {
      const tier = Number(sm.code.split('.')[0]);
      knownSubModules.set(sm.code, { tier, exam: sm.exam ?? 'COMMON', hasBaseMaterials: false });
    }
  }
  const seenSubs = new Set<string>();
  subs.forEach((s: SubModuleItemType, i) => {
    const p = `sub_modules[${i}]`;
    const mp = s.sub_module_code.split('.').slice(0, 2).join('.');
    if (mp !== s.module_code) errors.push(err(`${p}.sub_module_code`, 'module_mismatch', 'Dua angka depan sub_module_code harus sama dengan module_code.'));
    if (Number(s.module_code.split('.')[0]) !== s.tier_number) errors.push(err(`${p}.module_code`, 'tier_mismatch', 'Angka depan module_code harus sama dengan tier_number.'));
    if (seenSubs.has(s.sub_module_code)) errors.push(err(`${p}.sub_module_code`, 'duplicate_item', 'sub_module_code ganda dalam paket.'));
    seenSubs.add(s.sub_module_code);
    const mod = knownModules.get(s.module_code);
    if (ctx.modules !== undefined || mods.length) {
      if (!mod) errors.push(err(`${p}.module_code`, 'module_not_found', `Modul '${s.module_code}' tidak ada di DB maupun paket.`));
      else if (s.module_category && s.module_category !== mod.skill) errors.push(err(`${p}.module_category`, 'category_mismatch', 'module_category berbeda dengan skill modul.'));
    }
    if (v10 && !s.module_category) errors.push(err(`${p}.module_category`, 'module_category_required', 'module_category wajib pada kontrak 1.0.'));
    s.passing_score_percent ??= 75;
    s.order_index ??= Number(s.sub_module_code.split('.')[2]);
    checkProvenance(s, p);

    const m = s.materials;
    if (m) {
      checkMarkdown(m.article_markdown, `${p}.materials.article_markdown`, errors);
      m.videos?.forEach((v, vi) => {
        if (v.end_sec <= v.start_sec || v.end_sec > 21600) errors.push(err(`${p}.materials.videos[${vi}]`, 'invalid_video_range', 'end_sec harus > start_sec dan <= 21600.'));
      });
      const orders = new Set<number>();
      m.slides?.forEach((sl, si) => {
        const sp = `${p}.materials.slides[${si}]`;
        if (orders.has(sl.order)) errors.push(err(`${sp}.order`, 'duplicate_slide_order', 'order slide ganda.'));
        orders.add(sl.order);
        if (!!sl.asset_code === !!sl.image_url) errors.push(err(sp, 'asset_ref_required', 'Isi tepat satu dari asset_code atau image_url.'));
        else if (sl.image_url) {
          const code = urlToAssetCode(sl.image_url);
          if (!code) errors.push(err(`${sp}.image_url`, 'external_url_not_allowed', 'Hanya jalur /storage/... yang diterjemahkan ke asset_code (tanpa fetch URL).'));
          else {
            requireAsset(code, `${sp}.image_url`, undefined);
            sl.asset_code = code;
          }
          delete sl.image_url;
        } else requireAsset(sl.asset_code!, `${sp}.asset_code`);
        sl.alt ??= sl.caption;
      });
      m.attachments?.forEach((a, ai) => {
        const ap = `${p}.materials.attachments[${ai}]`;
        if (!!a.asset_code === !!a.file_url) errors.push(err(ap, 'asset_ref_required', 'Isi tepat satu dari asset_code atau file_url.'));
        else if (a.file_url) {
          const code = urlToAssetCode(a.file_url);
          if (!code) errors.push(err(`${ap}.file_url`, 'external_url_not_allowed', 'Hanya jalur /storage/... yang diterjemahkan ke asset_code (tanpa fetch URL).'));
          else {
            requireAsset(code, `${ap}.file_url`, 'DOCUMENT');
            a.asset_code = code;
          }
          delete a.file_url;
        } else requireAsset(a.asset_code!, `${ap}.asset_code`, 'DOCUMENT');
      });
    }

    const prevSubInfo = knownSubModules.get(s.sub_module_code);
    knownSubModules.set(s.sub_module_code, {
      tier: s.tier_number,
      exam: prevSubInfo?.exam ?? 'COMMON',
      hasBaseMaterials: prevSubInfo?.hasBaseMaterials || !!s.materials,
    });

    if (s.materials_variants && s.materials_variants.length > 0) {
      const seenStyles = new Set<string>();
      s.materials_variants.forEach((v, vi) => {
        const vp = `${p}.materials_variants[${vi}]`;
        if (v.style === 'LEARN_FIRST') {
          errors.push(err(`${vp}.style`, 'style_reserved', 'Gaya LEARN_FIRST dicadangkan untuk materi bawaan.'));
        }
        if (seenStyles.has(v.style)) {
          errors.push(err(`${vp}.style`, 'duplicate_style_variant', `Varian gaya '${v.style}' ganda.`));
        }
        seenStyles.add(v.style);
        checkMarkdown(v.article_markdown, `${vp}.article_markdown`, errors);
        v.videos?.forEach((vd, vdi) => {
          if (vd.end_sec <= vd.start_sec || vd.end_sec > 21600) {
            errors.push(err(`${vp}.videos[${vdi}]`, 'invalid_video_range', 'end_sec harus > start_sec dan <= 21600.'));
          }
        });
        const vOrders = new Set<number>();
        v.slides?.forEach((sl, si) => {
          const sp = `${vp}.slides[${si}]`;
          if (vOrders.has(sl.order)) errors.push(err(`${sp}.order`, 'duplicate_slide_order', 'order slide ganda.'));
          vOrders.add(sl.order);
          if (sl.asset_code) requireAsset(sl.asset_code, `${sp}.asset_code`);
        });
        v.attachments?.forEach((a, ai) => {
          const ap = `${vp}.attachments[${ai}]`;
          if (a.asset_code) requireAsset(a.asset_code, `${ap}.asset_code`, 'DOCUMENT');
        });
      });

      const hasBase = !!s.materials || (prevSubInfo?.hasBaseMaterials ?? false);
      if (!hasBase) {
        errors.push(err(`${p}.materials_variants`, 'variant_without_base', 'Sub-modul belum memiliki materi bawaan (BASE).'));
      }
    }

    const d = s.active_drill;
    if (d) {
      checkPassageText(d.reading_passage_markdown, `${p}.active_drill.reading_passage_markdown`, errors);
      if (d.listening_asset_code) requireAsset(d.listening_asset_code, `${p}.active_drill.listening_asset_code`, 'AUDIO_LISTENING');
      checkQuestionSet(d.questions, `${p}.active_drill.questions`, errors, { placement: false, passageText: d.reading_passage_markdown });
      checkStimulus(d.questions, `${p}.active_drill.questions`, requireAsset);
    }
  });

  // Set
  const keys = new Set<string>();
  const bossIds = new Map<number, Set<string>>();
  const hasBossParent = new Set<number>(sets.filter((x) => x.set_type === 'TIER_BOSS_EXAM' && x.tier_number).map((x) => x.tier_number!));
  sets.forEach((st, i) => {
    const p = `assessment_sets[${i}]`;
    checkProvenance(st, p);
    const t = st.set_type;
    if (t === 'SKIP_MODULE_TEST') {
      if (!st.module_code) errors.push(err(`${p}.module_code`, 'module_code_required', 'module_code wajib untuk SKIP_MODULE_TEST.'));
      else if ((ctx.modules !== undefined || mods.length) && !knownModules.has(st.module_code)) errors.push(err(`${p}.module_code`, 'module_not_found', `Modul '${st.module_code}' tidak ada.`));
    }
    if ((t === 'SKIP_TIER_TEST' || t === 'TIER_BOSS_EXAM' || t === 'BOSS_SECTION') && st.tier_number === undefined) {
      errors.push(err(`${p}.tier_number`, 'tier_number_required', 'tier_number wajib untuk tipe set ini.'));
    }
    if (t === 'BOSS_SECTION') {
      if (!st.skill_category) errors.push(err(`${p}.skill_category`, 'skill_category_required', 'skill_category wajib untuk BOSS_SECTION.'));
      if (st.tier_number !== undefined && !hasBossParent.has(st.tier_number)) {
        warnings.push(warn(`${p}.tier_number`, 'boss_parent_not_in_package', 'TIER_BOSS_EXAM tier ini tidak ada di paket; harus sudah ada di DB.'));
      }
    }
    if (t === 'TIER_BOSS_EXAM' && st.questions.length > 0) errors.push(err(`${p}.questions`, 'boss_parent_questions_not_empty', 'TIER_BOSS_EXAM induk wajib questions: [].'));
    if (t !== 'TIER_BOSS_EXAM' && st.time_limit_seconds === undefined) errors.push(err(`${p}.time_limit_seconds`, 'time_limit_required', 'time_limit_seconds wajib.'));
    if (t === 'BOSS_SECTION') {
      if (st.skill_category === 'LISTENING' && !st.listening_asset_code) errors.push(err(`${p}.listening_asset_code`, 'listening_asset_required', 'BOSS_SECTION LISTENING wajib listening_asset_code.'));
      if (st.skill_category === 'READING' && !st.reading_passage_markdown) errors.push(err(`${p}.reading_passage_markdown`, 'passage_required', 'BOSS_SECTION READING wajib reading_passage_markdown.'));
      const bad = (types: string[]) =>
        st.questions.forEach((q, qi) => {
          if (!types.includes(q.question_type)) errors.push(err(`${p}.questions[${qi}].question_type`, 'question_type_not_allowed', `Skill ${st.skill_category} hanya mengizinkan ${types.join('/')}.`));
        });
      if (st.skill_category === 'WRITING') bad(['WRITING_TASK']);
      if (st.skill_category === 'SPEAKING') bad(['SPEAKING_TASK']);
    }
    const key = setKeyOf(st);
    if (keys.has(key)) errors.push(err(`${p}.set_type`, 'duplicate_set_key', `Set dengan kunci alami '${key}' ganda.`));
    keys.add(key);

    checkPassageText(st.reading_passage_markdown, `${p}.reading_passage_markdown`, errors);
    if (st.listening_asset_code) requireAsset(st.listening_asset_code, `${p}.listening_asset_code`, 'AUDIO_LISTENING');
    let seenIds: Set<string> | undefined;
    if (t === 'BOSS_SECTION' && st.tier_number !== undefined) {
      seenIds = bossIds.get(st.tier_number) ?? new Set<string>();
      bossIds.set(st.tier_number, seenIds);
    }
    checkQuestionSet(st.questions, `${p}.questions`, errors, { placement: t === 'PLACEMENT_TEST', passageText: st.reading_passage_markdown, seenIds });
    checkStimulus(st.questions, `${p}.questions`, requireAsset);
  });

  checkLearningTracks(tracks, knownSubModules, errors);

  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, data: pkg, warnings };
}

/** Aturan validator jalur belajar (SPEC-021, daftar kode galat persis). */
function checkLearningTracks(
  tracks: NonNullable<ContentPackage['learning_tracks']>,
  known: Map<string, SubModuleInfo>,
  errors: ContentIssue[],
): void {
  const codesSeen = new Set<string>();
  const ordersSeen = new Set<number>();
  tracks.forEach((t, ti) => {
    const p = `learning_tracks[${ti}]`;
    if (codesSeen.has(t.track_code)) errors.push(err(`${p}.track_code`, 'duplicate_track_code', `track_code '${t.track_code}' ganda.`));
    codesSeen.add(t.track_code);
    if (ordersSeen.has(t.sort_order)) errors.push(err(`${p}.sort_order`, 'duplicate_sort_order', `sort_order ${t.sort_order} ganda.`));
    ordersSeen.add(t.sort_order);
    if (t.target_band_min > t.target_band_max) errors.push(err(`${p}.target_band_min`, 'band_range_invalid', 'target_band_min harus <= target_band_max.'));

    const items = t.items ?? [];
    if (t.kind === 'CURRICULUM') {
      if (items.length > 0) errors.push(err(`${p}.items`, 'curriculum_items_forbidden', 'Jalur CURRICULUM tidak boleh memuat items.'));
      return;
    }
    if (items.length === 0) {
      errors.push(err(`${p}.items`, 'invalid_value', 'Jalur CURATED wajib memuat items (1-60).'));
      return;
    }
    const sprint = t.layout === 'SPRINT';
    const seenSubs = new Set<string>();
    let prevTier = 0;
    let prevSlot: [number, number] | null = null;
    let group = 0;
    const groups: number[] = [];
    items.forEach((it, ii) => {
      const ip = `${p}.items[${ii}]`;
      if (it.kind === 'CHECKPOINT') {
        if (ii === 0) errors.push(err(ip, 'checkpoint_first', 'Checkpoint tidak boleh menjadi item pertama.'));
        else if (items[ii - 1]!.kind === 'CHECKPOINT') errors.push(err(ip, 'checkpoint_adjacent', 'Dua Checkpoint tidak boleh bersebelahan.'));
        else groups.push(group);
        group = 0;
        return;
      }
      group++;
      const code = it.sub_module_code;
      if (!code) {
        errors.push(err(`${ip}.sub_module_code`, 'invalid_value', 'sub_module_code wajib untuk item SUB_MODULE.'));
        return;
      }
      const info = known.get(code);
      if (!info) errors.push(err(`${ip}.sub_module_code`, 'sub_module_not_found', `Sub-modul '${code}' tidak ada.`));
      else {
        if (info.exam === 'ACADEMIC') errors.push(err(`${ip}.sub_module_code`, 'sub_module_not_gt', `Sub-modul '${code}' bertag ACADEMIC.`));
        if (info.tier < prevTier) errors.push(err(`${ip}.sub_module_code`, 'tier_order_violation', 'Tier item tidak boleh menurun.'));
        prevTier = Math.max(prevTier, info.tier);
      }
      if (seenSubs.has(code)) errors.push(err(`${ip}.sub_module_code`, 'duplicate_sub_module_in_track', `Sub-modul '${code}' ganda dalam jalur.`));
      seenSubs.add(code);
      const hasSlot = it.week_no !== undefined || it.day_no !== undefined;
      if (sprint) {
        if (it.week_no === undefined || it.day_no === undefined) {
          errors.push(err(ip, 'sprint_slot_required', 'Jalur SPRINT: week_no dan day_no wajib.'));
        } else {
          if (prevSlot && (it.week_no < prevSlot[0] || (it.week_no === prevSlot[0] && it.day_no <= prevSlot[1]))) {
            errors.push(err(ip, 'sprint_slot_order', 'Pasangan (week_no, day_no) harus unik dan menaik.'));
          }
          prevSlot = [it.week_no, it.day_no];
        }
      } else if (hasSlot) {
        errors.push(err(ip, 'slot_not_allowed', 'week_no/day_no hanya untuk jalur SPRINT.'));
      }
    });
    if (items[items.length - 1]!.kind !== 'CHECKPOINT') {
      errors.push(err(`${p}.items`, 'checkpoint_last_required', 'Item terakhir harus Checkpoint.'));
    }
    groups.forEach((size, gi) => {
      if (size === 0) return; // sudah dilaporkan sebagai checkpoint_first/adjacent
      const isLast = gi === groups.length - 1;
      if (size > 6 || (!isLast && size < 4)) {
        errors.push(err(`${p}.items`, 'checkpoint_group_size', `Grup ke-${gi + 1} berisi ${size} sub-modul; diizinkan 1-6 (4-6 kecuali grup terakhir).`));
      }
    });
  });
}

function checkStimulus(qs: Question[], path: string, requireAsset: (c: string, p: string, k?: string) => void) {
  qs.forEach((q, i) => {
    if (q.question_type === 'WRITING_TASK' && q.stimulus_asset_code) requireAsset(q.stimulus_asset_code, `${path}[${i}].stimulus_asset_code`, 'IMAGE');
  });
}

// ---------------------------------------------------------------- Manifest
export function parseAssetManifest(raw: unknown, ctx: Pick<ParseContext, 'sources'> = {}): { ok: true; data: AssetManifest; warnings: ContentIssue[] } | { ok: false; errors: ContentIssue[]; warnings: ContentIssue[] } {
  const errors: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];
  const clean = sanitizeRaw(raw, errors);
  const parsed = AssetManifestSchema.safeParse(clean);
  if (!parsed.success) {
    errors.push(...zodIssues(parsed.error));
    return { ok: false, errors, warnings };
  }
  const seen = new Set<string>();
  parsed.data.assets.forEach((a, i) => {
    const p = `assets[${i}]`;
    if (seen.has(a.asset_code)) errors.push(err(`${p}.asset_code`, 'duplicate_asset_code', 'asset_code ganda dalam manifest.'));
    seen.add(a.asset_code);
    if (a.rights_status === 'EMBED_ONLY' || a.rights_status === 'LINK_ONLY') errors.push(err(`${p}.rights_status`, 'rights_not_storable', 'Hak EMBED_ONLY/LINK_ONLY tidak boleh memiliki berkas tersimpan.'));
    if (a.file.includes('\\') || a.file.split('/').includes('..') || a.file.startsWith('/') || /^[A-Za-z]:/.test(a.file)) {
      errors.push(err(`${p}.file`, 'path_traversal', 'Path berkas tidak boleh memuat .., \\, atau path absolut.'));
    }
    if (a.file.toLowerCase().endsWith('.svg')) errors.push(err(`${p}.file`, 'svg_not_allowed', 'SVG ditolak.'));
    const src = ctx.sources?.get(a.source_code);
    if (ctx.sources) {
      if (!src) errors.push(err(`${p}.source_code`, 'source_not_found', `Sumber '${a.source_code}' tidak dikenal.`));
      else {
        if (!src.mayStoreCopy) errors.push(err(`${p}.source_code`, 'source_not_storable', 'Sumber ini tidak boleh menyimpan salinan.'));
        if ((src.shareAlike || src.licenseType.startsWith('CC_BY')) && !a.attribution_text) errors.push(err(`${p}.attribution_text`, 'attribution_required', 'Atribusi wajib.'));
      }
    }
  });
  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, data: parsed.data, warnings };
}

export { OBJECTIVE_TYPES, splitPassages };
