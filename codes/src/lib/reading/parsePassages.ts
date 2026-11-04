/**
 * parsePassages (SPEC-010): fungsi murni pemecah teks bacaan Reading, dipakai UI (dan dapat dipakai validator).
 * Format: maks 3 teks dipisah baris PERSIS `===PASSAGE===`; baris pertama tak kosong boleh `# Judul`;
 * paragraf dipisah baris kosong; `[X] ` di awal paragraf = label X (token label dibuang dari teks).
 * Aturan pemecahan ada di `passage-core.ts` (sumber tunggal bersama validator server; QA F-10-01).
 */
import { analyzePassages, MAX_PASSAGES, PASSAGE_SEPARATOR } from './passage-core';

export { MAX_PASSAGES, PASSAGE_SEPARATOR };

export type PassageParagraph = { index: number; label: string | null; text: string };
export type Passage = { passage_no: number; title: string; paragraphs: PassageParagraph[] };

export type PassageErrorCode = 'too_many_passages' | 'duplicate_paragraph_label';

export class PassageParseError extends Error {
  readonly code: PassageErrorCode;
  constructor(code: PassageErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PassageParseError';
    this.code = code;
  }
}

export function parsePassages(markdown: string): Passage[] {
  const parsed = analyzePassages(markdown);
  if (parsed.length > MAX_PASSAGES) throw new PassageParseError('too_many_passages');
  return parsed.map((p) => {
    const dup = p.duplicate_labels[0];
    if (dup) throw new PassageParseError('duplicate_paragraph_label', `duplicate_paragraph_label: ${dup}`);
    return { passage_no: p.passage_no, title: p.title, paragraphs: p.paragraphs };
  });
}
