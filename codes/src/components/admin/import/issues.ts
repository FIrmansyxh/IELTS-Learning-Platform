import type { ImportItem, ItemIssue } from '@/contracts/import';
import { id } from '@/i18n/id';

export type FlatIssue = ItemIssue & { row: number; entityCode: string | null };

/** Meratakan galat/peringatan semua item menjadi baris tabel (file/baris/path/kode). */
export function flattenIssues(items: readonly ImportItem[]): FlatIssue[] {
  const out: FlatIssue[] = [];
  for (const it of items) {
    for (const e of it.errors) out.push({ ...e, row: it.row_number, entityCode: it.entity_code });
  }
  return out;
}

/** Pesan terbaca: pesan server (sudah Indonesia) bila ada, selain itu kamus kode, selain itu kode. */
export function issueMessage(i: Pick<ItemIssue, 'code' | 'message'>): string {
  return i.message?.trim() || id.fieldErrors[i.code] || i.code;
}

/**
 * Sel CSV aman: sel yang diawali `= + - @ \t \r` diberi awalan `'` (anti formula injection saat laporan
 * dibuka di spreadsheet), lalu dikutip bila memuat koma, kutip, atau baris baru.
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildErrorReportCsv(issues: readonly FlatIssue[]): string {
  const header = ['baris', 'entitas', 'path', 'kode', 'tingkat', 'pesan'];
  const lines = issues.map((i) =>
    [i.row, i.entityCode, i.path, i.code, i.severity === 'error' ? 'error' : 'peringatan', issueMessage(i)]
      .map(csvCell)
      .join(','),
  );
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
