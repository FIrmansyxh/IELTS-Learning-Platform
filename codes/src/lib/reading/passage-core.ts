/**
 * Sumber kebenaran TUNGGAL format teks bacaan Reading (SPEC-004 validator, SPEC-010 UI). Fungsi murni tanpa
 * dependensi klien/server: dipakai `server/content/passages.ts` (validasi impor) dan `lib/reading/parsePassages.ts` (tampilan),
 * sehingga konten yang lolos validasi selalu dipecah identik oleh pelajar (QA F-10-01).
 *
 * Aturan (satu tempat):
 *  - Akhir baris dinormalkan sekali: `\r\n` dan `\r` -> `\n`.
 *  - Pemisah adalah baris PERSIS `===PASSAGE===`. Bagian kosong (pemisah di awal/akhir/berurutan) TETAP dihitung
 *    sebagai bagian, supaya `passage_no` soal sama di server dan klien; validator melaporkannya sebagai `empty_passage`.
 *  - Judul: baris tak kosong pertama berbentuk `# Judul`.
 *  - Paragraf dipisah baris kosong (boleh berisi spasi/tab). Label: `[A-Z]` + TEPAT satu spasi di awal paragraf.
 */
export const PASSAGE_SEPARATOR = '===PASSAGE===';
export const MAX_PASSAGES = 3;

export interface CoreParagraph {
  index: number;
  label: string | null;
  text: string;
}
export interface CorePassage {
  passage_no: number;
  title: string;
  /** Teks bagian setelah dipangkas (termasuk baris judul bila ada). */
  body: string;
  paragraphs: CoreParagraph[];
  /** Label yang muncul lebih dari sekali pada bagian ini (urut kemunculan kedua, unik). */
  duplicate_labels: string[];
  empty: boolean;
}

export const normalizeNewlines = (s: string): string => s.replace(/\r\n?/g, '\n');

/** Pecah menjadi bagian mentah (belum dipangkas). Selalu mengembalikan >= 1 bagian. */
export function splitSections(markdown: string): string[] {
  const sections: string[][] = [[]];
  for (const line of normalizeNewlines(markdown).split('\n')) {
    if (line === PASSAGE_SEPARATOR) sections.push([]);
    else sections[sections.length - 1]!.push(line);
  }
  return sections.map((s) => s.join('\n'));
}

const LABEL_RE = /^\[([A-Z])\] /;

function analyzeSection(section: string, passageNo: number): CorePassage {
  const trimmed = section.replace(/^\s*\n/, '').replace(/\s+$/, '');
  let body = trimmed;
  let title = `Teks ${passageNo}`;
  const first = /^\s*#\s+(.+?)\s*(?:\n|$)/.exec(body);
  if (first) {
    title = first[1]!;
    body = body.slice(first[0].length);
  }
  const seen = new Set<string>();
  const dup = new Set<string>();
  const paragraphs: CoreParagraph[] = [];
  for (const raw of body.split(/\n[ \t]*\n+/)) {
    let text = raw.replace(/^\s+/, '').replace(/\s+$/, '');
    if (!text) continue;
    let label: string | null = null;
    const m = LABEL_RE.exec(text);
    if (m) {
      label = m[1]!;
      text = text.slice(m[0].length);
      if (seen.has(label)) dup.add(label);
      seen.add(label);
    }
    paragraphs.push({ index: paragraphs.length, label, text });
  }
  return { passage_no: passageNo, title, body: section.trim(), paragraphs, duplicate_labels: [...dup], empty: trimmed.length === 0 };
}

export function analyzePassages(markdown: string): CorePassage[] {
  return splitSections(markdown).map((s, i) => analyzeSection(s, i + 1));
}
