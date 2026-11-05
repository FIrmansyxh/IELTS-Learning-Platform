export type ByteRange =
  | { type: 'full' }
  | { type: 'partial'; start: number; end: number }
  | { type: 'invalid' };

/**
 * Parsing header HTTP Range: bytes=... sesuai RFC 9110 & SPEC-011.
 * - Multi-rentang diabaikan (mengembalikan 'full' -> 200)
 * - bytes=-500 mengembalikan 500 byte terakhir
 * - start >= totalSize atau format tidak valid mengembalikan 'invalid' -> 416
 */
export function parseByteRange(rangeHeader: string | null | undefined, totalSize: number): ByteRange {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return { type: 'full' };
  }
  const spec = rangeHeader.slice('bytes='.length).trim();
  // Multi-rentang: bila ada koma, abaikan dan kirim full 200 (sesuai SPEC-011)
  if (spec.includes(',')) {
    return { type: 'full' };
  }
  // Suffix: bytes=-500 (500 byte terakhir)
  const suffixMatch = /^-(\d+)$/.exec(spec);
  if (suffixMatch) {
    const len = parseInt(suffixMatch[1]!, 10);
    if (len <= 0) return { type: 'invalid' };
    const actualLen = Math.min(len, totalSize);
    const start = totalSize - actualLen;
    const end = totalSize - 1;
    if (start < 0 || start > end) return { type: 'invalid' };
    return { type: 'partial', start, end };
  }
  // Start-End or Start- (e.g. 0-1023 or 1000-)
  const rangeMatch = /^(\d+)-(\d*)$/.exec(spec);
  if (!rangeMatch) {
    return { type: 'invalid' };
  }
  const start = parseInt(rangeMatch[1]!, 10);
  const endStr = rangeMatch[2];
  const end = endStr ? parseInt(endStr, 10) : totalSize - 1;

  if (start < 0 || start >= totalSize || end < start) {
    return { type: 'invalid' };
  }
  const clampedEnd = Math.min(end, totalSize - 1);
  return { type: 'partial', start, end: clampedEnd };
}
