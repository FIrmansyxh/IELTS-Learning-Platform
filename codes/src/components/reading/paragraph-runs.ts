import type { Highlight } from '@/lib/reading/storage';

/** Analisis paragraf teks bacaan menjadi blok yang dapat dirender sebagai segmen React (tanpa HTML mentah). */
export type Run = { start: number; end: number; style: 'plain' | 'b' | 'i' };
export type Line = { bullet: 'ul' | 'ol' | null; runs: Run[] };
export type Block =
  | { kind: 'text'; lines: Line[] }
  | { kind: 'list'; lines: Line[] }
  | { kind: 'plain'; text: string };

const BULLET = /^(\s*)([-*+]|\d+[.)])\s+/;
const EMPHASIS = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;

function lineRuns(text: string, from: number, to: number): Run[] {
  const runs: Run[] = [];
  const slice = text.slice(from, to);
  let cursor = 0;
  EMPHASIS.lastIndex = 0;
  for (let m = EMPHASIS.exec(slice); m; m = EMPHASIS.exec(slice)) {
    const bold = m[1] !== undefined;
    const mk = bold ? 2 : 1;
    if (m.index > cursor) runs.push({ start: from + cursor, end: from + m.index, style: 'plain' });
    runs.push({ start: from + m.index + mk, end: from + m.index + m[0].length - mk, style: bold ? 'b' : 'i' });
    cursor = m.index + m[0].length;
  }
  if (cursor < slice.length) runs.push({ start: from + cursor, end: from + slice.length, style: 'plain' });
  return runs;
}

export function analyzeParagraph(text: string): Block {
  const rawLines = text.split('\n');
  if (rawLines.some((l) => /^\s*\|/.test(l) || /^\s*```/.test(l))) return { kind: 'plain', text };
  const lines: Line[] = [];
  let offset = 0;
  let allBullets = true;
  for (const raw of rawLines) {
    const m = BULLET.exec(raw);
    if (m) {
      lines.push({ bullet: /^\d/.test(m[2]!) ? 'ol' : 'ul', runs: lineRuns(text, offset + m[0].length, offset + raw.length) });
    } else {
      allBullets = false;
      lines.push({ bullet: null, runs: lineRuns(text, offset, offset + raw.length) });
    }
    offset += raw.length + 1;
  }
  return { kind: allBullets ? 'list' : 'text', lines };
}

export type Piece = { start: number; end: number; style: Run['style']; highlight: Highlight | null };

/** Memecah satu run pada batas sorotan; pada tumpang-tindih, sorotan yang ditambahkan terakhir menang. */
export function splitRun(run: Run, highlights: Highlight[]): Piece[] {
  const cuts = new Set<number>([run.start, run.end]);
  for (const h of highlights) {
    if (h.start > run.start && h.start < run.end) cuts.add(h.start);
    if (h.end > run.start && h.end < run.end) cuts.add(h.end);
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const pieces: Piece[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]!;
    const end = sorted[i + 1]!;
    let hit: Highlight | null = null;
    for (const h of highlights) if (h.start <= start && h.end >= end) hit = h;
    pieces.push({ start, end, style: run.style, highlight: hit });
  }
  return pieces;
}
