/**
 * Validasi teks bacaan sisi server (SPEC-004; SPEC-010). Seluruh aturan pemecahan ada di
 * `@/lib/reading/passage-core` (sumber tunggal, dipakai juga parser klien) agar tidak pernah menyimpang (QA F-10-01).
 */
import { analyzePassages, MAX_PASSAGES, PASSAGE_SEPARATOR, splitSections, type CorePassage } from '@/lib/reading/passage-core';

export { MAX_PASSAGES, PASSAGE_SEPARATOR };

export interface ParsedPassage {
  index: number; // 1-based
  text: string;
  labels: string[];
  empty: boolean;
}

/** Bagian teks (dipangkas) TERMASUK yang kosong, identik dengan jumlah bagian yang dilihat pelajar. */
export function splitPassages(markdown: string): string[] {
  return splitSections(markdown).map((s) => s.trim());
}

const toParsed = (p: CorePassage): ParsedPassage => ({
  index: p.passage_no,
  text: p.body,
  labels: p.paragraphs.flatMap((x) => (x.label ? [x.label] : [])),
  empty: p.empty,
});

export function parsePassages(markdown: string): ParsedPassage[] {
  return analyzePassages(markdown).map(toParsed);
}

export function duplicateLabels(p: ParsedPassage): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const l of p.labels) {
    if (seen.has(l)) dup.add(l);
    seen.add(l);
  }
  return [...dup];
}
