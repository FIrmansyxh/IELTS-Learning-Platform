export type Correction = { original: string; improved: string; reason_id: string };

export type TextSegment = { text: string; correction: Correction | null };

/**
 * Anotasi inline (SPEC-012): tiap `original` dicari persis, kemunculan pertama. Yang tidak ditemukan
 * (atau bertabrakan dengan anotasi sebelumnya) dikembalikan di `unmatched` untuk daftar "Koreksi".
 * Hasilnya hanya teks polos; tidak pernah HTML.
 */
export function annotateText(text: string, corrections: Correction[]): { segments: TextSegment[]; unmatched: Correction[] } {
  const found: Array<{ start: number; end: number; correction: Correction }> = [];
  const unmatched: Correction[] = [];
  for (const c of corrections) {
    const idx = c.original.length > 0 ? text.indexOf(c.original) : -1;
    if (idx < 0) {
      unmatched.push(c);
      continue;
    }
    const end = idx + c.original.length;
    if (found.some((f) => idx < f.end && end > f.start)) {
      unmatched.push(c);
      continue;
    }
    found.push({ start: idx, end, correction: c });
  }
  found.sort((a, b) => a.start - b.start);
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const f of found) {
    if (f.start > cursor) segments.push({ text: text.slice(cursor, f.start), correction: null });
    segments.push({ text: text.slice(f.start, f.end), correction: f.correction });
    cursor = f.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), correction: null });
  if (segments.length === 0) segments.push({ text, correction: null });
  return { segments, unmatched };
}
