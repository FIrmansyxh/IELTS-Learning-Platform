/**
 * Pemeriksaan SINKRON berkas impor (SPEC-019 I2). Tidak ada fetch/eksekusi; semua murni terhadap byte yang diunggah.
 * Pelanggaran -> 400 IMPORT_FILE_INVALID (details[].code) atau 415 UNSUPPORTED_FILE_TYPE.
 */
import { parse as parseCsv } from 'csv-parse/sync';
import { ApiError } from '../http/errors';

export const MAX_JSON_DEPTH = 10;
export const MAX_JSON_ITEMS = 2000;
export const MAX_CSV_ROWS = 5000;
export const MAX_CSV_COLUMNS = 50;
export const MAX_CELL_LENGTH = 5000;
export const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const CSV_REQUIRED_HEADERS = ['set_type', 'scope_code', 'question_id', 'question_type', 'skill', 'prompt', 'correct_answers', 'explanation_id'] as const;
export const CSV_OPTIONAL_HEADERS = ['options', 'max_words', 'points', 'target_time_ms', 'difficulty', 'passage_no', 'section_no'] as const;
export const CSV_ALL_HEADERS: readonly string[] = [...CSV_REQUIRED_HEADERS, ...CSV_OPTIONAL_HEADERS];

const MESSAGES: Record<string, string> = {
  invalid_encoding: 'Berkas harus UTF-8 yang valid.',
  double_bom: 'Berkas memiliki lebih dari satu BOM.',
  control_char: 'Berkas memuat karakter kontrol yang tidak diizinkan.',
  json_syntax: 'Sintaks JSON tidak valid.',
  depth_exceeded: 'Kedalaman JSON melebihi 10.',
  forbidden_key: 'Berkas memuat kunci terlarang (__proto__/constructor/prototype).',
  contract_version_unsupported: 'contract_version harus "1.0" atau "1.1".',
  too_many_items: 'Berkas melebihi 2.000 item.',
  csv_syntax: 'Sintaks CSV tidak valid.',
  csv_header_invalid: 'Header CSV tidak sesuai templat.',
  too_many_rows: 'CSV melebihi 5.000 baris.',
  too_many_columns: 'CSV melebihi 50 kolom.',
  cell_too_long: 'Ada sel CSV lebih panjang dari 5.000 karakter.',
};

export const importFileInvalid = (code: string, path = 'file') =>
  new ApiError('IMPORT_FILE_INVALID', {
    status: 400,
    message: 'Berkas impor tidak valid.',
    details: [{ path, code, message: MESSAGES[code] ?? code }],
  });

const unsupported = () => new ApiError('UNSUPPORTED_FILE_TYPE', { status: 415, message: 'Jenis berkas tidak didukung.' });

/** Nama dasar disanitasi: hanya [A-Za-z0-9._-], lainnya `_`, maks 255. */
export function sanitizeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');
  return (base || 'upload').slice(0, 255);
}

export interface CheckedJson {
  format: 'JSON';
  text: string;
  json: Record<string, unknown>;
  contractVersion: '1.0' | '1.1';
  itemCount: number;
}
export interface CheckedCsv {
  format: 'CSV';
  text: string;
  headers: string[];
  /** Baris data (tanpa header); `lineNo` = nomor baris pada lembar (header = 1). */
  rows: Array<{ lineNo: number; cells: string[] }>;
  contractVersion: '1.1';
  itemCount: number;
}
export type CheckedImport = CheckedJson | CheckedCsv;

const CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

function decodeUtf8(buf: Buffer): string {
  if (buf.length >= 6 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf && buf[3] === 0xef && buf[4] === 0xbb && buf[5] === 0xbf) {
    throw importFileInvalid('double_bom');
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
  } catch {
    throw importFileInvalid('invalid_encoding');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.charCodeAt(0) === 0xfeff) throw importFileInvalid('double_bom');
  if (CONTROL_RE.test(text)) throw importFileInvalid('control_char');
  return text;
}

/** Kedalaman maksimum kontainer JSON lewat pemindaian token (aman terhadap bersarang sangat dalam). */
function jsonDepth(text: string): number {
  let depth = 0;
  let max = 0;
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inStr) {
      if (c === 0x5c) i++;
      else if (c === 0x22) inStr = false;
      continue;
    }
    if (c === 0x22) inStr = true;
    else if (c === 0x7b || c === 0x5b) {
      depth++;
      if (depth > max) max = depth;
      if (max > MAX_JSON_DEPTH) return max;
    } else if (c === 0x7d || c === 0x5d) depth--;
  }
  return max;
}

function hasForbiddenKey(v: unknown): boolean {
  const stack: unknown[] = [v];
  while (stack.length) {
    const x = stack.pop();
    if (Array.isArray(x)) for (const e of x) stack.push(e); // bukan spread: array jutaan elemen meledakkan stack
    else if (x !== null && typeof x === 'object') {
      for (const k of Object.keys(x)) {
        if (FORBIDDEN_KEYS.has(k)) return true;
        stack.push((x as Record<string, unknown>)[k]);
      }
    }
  }
  return false;
}

function looksBinary(buf: Buffer): boolean {
  const h = buf.subarray(0, 8);
  return (
    (h[0] === 0x50 && h[1] === 0x4b) || // PK (zip/xlsx/docx)
    (h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46) || // %PDF
    (h[0] === 0x4d && h[1] === 0x5a) || // MZ
    (h[0] === 0x7f && h[1] === 0x45 && h[2] === 0x4c && h[3] === 0x46) || // ELF
    (h[0] === 0xd0 && h[1] === 0xcf && h[2] === 0x11 && h[3] === 0xe0) // OLE (xls)
  );
}

export function checkImportFile(buf: Buffer, format: 'JSON' | 'CSV', fileName: string): CheckedImport {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if ((format === 'JSON' && ext !== 'json') || (format === 'CSV' && ext !== 'csv') || looksBinary(buf)) throw unsupported();
  const text = decodeUtf8(buf);
  return format === 'JSON' ? checkJson(text) : checkCsv(text);
}

function checkJson(text: string): CheckedJson {
  if (jsonDepth(text) > MAX_JSON_DEPTH) throw importFileInvalid('depth_exceeded');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw importFileInvalid('json_syntax');
  }
  if (hasForbiddenKey(json)) throw importFileInvalid('forbidden_key');
  if (json === null || typeof json !== 'object' || Array.isArray(json)) throw importFileInvalid('contract_version_unsupported', 'contract_version');
  const root = json as Record<string, unknown>;
  const cv = root.contract_version;
  if (cv !== '1.0' && cv !== '1.1') throw importFileInvalid('contract_version_unsupported', 'contract_version');
  const len = (k: string) => (Array.isArray(root[k]) ? (root[k] as unknown[]).length : 0);
  const itemCount = len('modules') + len('sub_modules') + len('assessment_sets');
  if (itemCount > MAX_JSON_ITEMS) throw importFileInvalid('too_many_items');
  return { format: 'JSON', text, json: root, contractVersion: cv, itemCount };
}

function checkCsv(text: string): CheckedCsv {
  let records: string[][];
  try {
    records = parseCsv(text, { skip_empty_lines: true, relax_column_count: true, delimiter: ',', quote: '"', escape: '"', bom: false }) as string[][];
  } catch {
    throw importFileInvalid('csv_syntax');
  }
  const header = records[0];
  if (!header) throw importFileInvalid('csv_header_invalid');
  if (header.length > MAX_CSV_COLUMNS) throw importFileInvalid('too_many_columns');
  const headers = header.map((h) => h.trim());
  const set = new Set(headers);
  if (set.size !== headers.length || headers.some((h) => !CSV_ALL_HEADERS.includes(h)) || CSV_REQUIRED_HEADERS.some((h) => !set.has(h))) {
    throw importFileInvalid('csv_header_invalid');
  }
  const data = records.slice(1);
  if (data.length > MAX_CSV_ROWS) throw importFileInvalid('too_many_rows');
  for (const r of data) {
    if (r.length > MAX_CSV_COLUMNS) throw importFileInvalid('too_many_columns');
    if (r.some((c) => c.length > MAX_CELL_LENGTH)) throw importFileInvalid('cell_too_long');
  }
  return { format: 'CSV', text, headers, rows: data.map((cells, i) => ({ lineNo: i + 2, cells })), contractVersion: '1.1', itemCount: data.length };
}
