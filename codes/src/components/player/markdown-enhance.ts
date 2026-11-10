/**
 * Pra-pemrosesan Markdown materi (murni, tanpa efek samping) yang mengubah pola tulisan yang sudah ada menjadi
 * directive blok interaktif, sehingga seluruh materi ikut interaktif tanpa ditulis ulang:
 *  - "Cek diri" (daftar pertanyaan bernomor + baris "**Kunci:**") menjadi `:::selfcheck`.
 *  - Contoh jawaban Band 5/6/7 (daftar "- **Band N:** ...") menjadi `:::levels`.
 * Bila pola tidak cocok sempurna (jumlah kunci berbeda, butir bercabang), teks asli dibiarkan apa adanya.
 */

/** Nama directive yang dirender sebagai blok interaktif (lihat interactive-blocks.tsx). */
export const BLOCK_DIRECTIVES = [
  'flow',
  'timeline',
  'layers',
  'compare',
  'flip',
  'quiz',
  'checklist',
  'selfcheck',
  'levels',
] as const;
export type BlockName = (typeof BLOCK_DIRECTIVES)[number];

const clean = (s: string): string => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

/** Posisi penanda "N. " (di awal teks atau didahului spasi) pada teks kunci; -1 bila tidak ada. */
function markerAt(text: string, n: number): number {
  const token = `${n}. `;
  let from = 0;
  for (;;) {
    const i = text.indexOf(token, from);
    if (i < 0) return -1;
    if (i === 0 || /\s/.test(text.charAt(i - 1))) return i;
    from = i + 1;
  }
}

/** "Cek diri" -> :::selfcheck (baris `Q| pertanyaan` lalu `A| jawaban`, urutan sama). */
export function enhanceSelfCheck(markdown: string): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => /^\*\*Cek diri\b.*\*\*\s*$/.test(l.trim()));
  if (start < 0) return markdown;
  const keyIdx = lines.findIndex((l, i) => i > start && /^\*\*Kunci:\*\*/.test(l.trim()));
  if (keyIdx < 0) return markdown;

  const questions: string[] = [];
  for (let i = start + 1; i < keyIdx; i += 1) {
    const m = /^\s*(\d+)\.\s+(.+?)\s*$/.exec(lines[i]!);
    if (m) questions.push(clean(m[2]!));
    else if (lines[i]!.trim() !== '') return markdown; // butir tak dikenal: jangan ubah
  }
  if (questions.length < 2) return markdown;

  const keyText = lines[keyIdx]!.replace(/^\s*\*\*Kunci:\*\*\s*/, '');
  // Pisah pada "N. " yang berurutan 1..n (menghindari angka desimal seperti 3.45 yang tidak diikuti spasi).
  const answers: string[] = [];
  let rest = keyText;
  for (let n = 1; n <= questions.length; n += 1) {
    const at = markerAt(rest, n);
    if (at < 0) return markdown;
    rest = rest.slice(at + `${n}. `.length);
    const next = n < questions.length ? markerAt(rest, n + 1) : -1;
    if (n < questions.length && next < 0) return markdown;
    answers.push(clean(next >= 0 ? rest.slice(0, next) : rest));
  }
  if (answers.some((a) => a === '')) return markdown;

  const block = [':::selfcheck', ...questions.map((q) => `Q| ${q}`), ...answers.map((a) => `A| ${a}`), ':::'];
  return [...lines.slice(0, start + 1), '', ...block, ...lines.slice(keyIdx + 1)].join('\n');
}

/** Daftar "- **Band N:** teks" (butir satu baris) -> :::levels (baris `Band N| teks`). */
export function enhanceLevels(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const first = /^-\s+\*\*(Band\s+\d(?:\.\d)?)(?::)?\*\*:?\s*(.+)$/.exec(lines[i]!);
    if (!first) {
      out.push(lines[i]!);
      i += 1;
      continue;
    }
    const group: string[] = [];
    let j = i;
    let ok = true;
    while (j < lines.length) {
      const m = /^-\s+\*\*(Band\s+\d(?:\.\d)?)(?::)?\*\*:?\s*(.+)$/.exec(lines[j]!);
      if (!m) break;
      group.push(`${m[1]}| ${clean(m[2]!)}`);
      j += 1;
      // butir bercabang (baris lanjutan berindentasi atau paragraf terputus oleh butir berikutnya): batalkan
      if (j < lines.length && /^\s{2,}\S/.test(lines[j]!)) ok = false;
      if (j < lines.length && lines[j]!.trim() === '' && /^\s{2,}\S/.test(lines[j + 1] ?? '')) ok = false;
    }
    if (ok && group.length >= 2) {
      out.push(':::levels', ...group, ':::');
      i = j;
    } else {
      out.push(lines[i]!);
      i += 1;
    }
  }
  return out.join('\n');
}

/** Semua pra-pemrosesan, aman dipanggil berulang (idempoten). */
export function enhanceMarkdown(markdown: string): string {
  if (!markdown.includes('Cek diri') && !markdown.includes('**Band ')) return markdown;
  return enhanceLevels(enhanceSelfCheck(markdown));
}
