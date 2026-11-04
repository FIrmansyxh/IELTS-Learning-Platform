/**
 * Penguraian header `Range` untuk GET /attempts/{id}/audio (SPEC-011). Fungsi murni.
 * - tanpa header, satuan selain `bytes`, atau multi-rentang -> `full` (balas 200 penuh);
 * - bentuk `bytes=` yang cacat, `start >= total`, `start > end`, sufiks `-0` -> `invalid` (416);
 * - `end` di luar berkas dipotong ke `total-1`; sufiks `-N` lebih besar dari berkas = seluruh berkas.
 */
export type AudioRange = { kind: 'full' } | { kind: 'range'; start: number; end: number } | { kind: 'invalid' };

const RANGE_RE = /^(\d*)-(\d*)$/;

export function parseAudioRange(header: string | null | undefined, size: number): AudioRange {
  if (!header) return { kind: 'full' };
  const h = header.trim();
  const eq = h.indexOf('=');
  if (eq < 0 || h.slice(0, eq).trim().toLowerCase() !== 'bytes') return { kind: 'full' };
  const spec = h.slice(eq + 1).trim();
  if (spec.includes(',')) return { kind: 'full' }; // multi-rentang diabaikan
  const m = RANGE_RE.exec(spec);
  if (!m || (m[1] === '' && m[2] === '')) return { kind: 'invalid' };
  if (size <= 0) return { kind: 'invalid' };
  if (m[1] === '') {
    const n = Number(m[2]);
    if (!Number.isSafeInteger(n) || n === 0) return { kind: 'invalid' };
    return { kind: 'range', start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  if (!Number.isSafeInteger(start) || start >= size) return { kind: 'invalid' };
  if (m[2] === '') return { kind: 'range', start, end: size - 1 };
  const end = Number(m[2]);
  if (!Number.isSafeInteger(end) || end < start) return { kind: 'invalid' };
  return { kind: 'range', start, end: Math.min(end, size - 1) };
}
