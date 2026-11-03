/**
 * parsePassages (dipakai SPEC-004 untuk validasi; SPEC-010 memakainya untuk tampilan split-screen).
 * Satu teks berisi maks 3 bagian dipisah baris tunggal `===PASSAGE===`. Paragraf berlabel diawali `[A] `.
 */
export const PASSAGE_SEPARATOR = '===PASSAGE===';
export const MAX_PASSAGES = 3;

export interface ParsedPassage {
  index: number; // 1-based
  text: string;
  labels: string[];
}

export function splitPassages(markdown: string): string[] {
  return markdown
    .split(/\r?\n===PASSAGE===\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function parsePassages(markdown: string): ParsedPassage[] {
  return splitPassages(markdown).map((text, i) => {
    const labels: string[] = [];
    for (const para of text.split(/\n{2,}/)) {
      const m = /^\[([A-Z])\]\s/.exec(para.trimStart());
      if (m) labels.push(m[1] as string);
    }
    return { index: i + 1, text, labels };
  });
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
