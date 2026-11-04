/**
 * Deteksi tipe rekaman dari magic bytes (SPEC-013). Ekstensi dan Content-Type klien DIABAIKAN.
 * Diterima: audio/webm (EBML + doctype webm, tanpa trek video), audio/ogg (OggS), audio/mp4 (kotak `ftyp` merek audio/MP4).
 */
export type RecordingMime = 'audio/webm' | 'audio/ogg' | 'audio/mp4';

const MP4_BRANDS = new Set(['M4A ', 'M4B ', 'mp42', 'mp41', 'isom', 'iso2', 'iso4', 'iso5', 'iso6', 'dash', 'F4A ']);
const VIDEO_CODEC_IDS = ['V_VP8', 'V_VP9', 'V_AV1', 'V_MPEG4', 'V_MPEGH'];

export function detectRecordingMime(buf: Uint8Array): RecordingMime | null {
  if (buf.length < 12) return null;
  const ascii = (from: number, to: number) => Buffer.from(buf.subarray(from, to)).toString('latin1');
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    const head = ascii(0, Math.min(buf.length, 4096));
    if (!head.slice(0, 64).includes('webm')) return null; // doctype matroska (bukan webm) ditolak
    if (VIDEO_CODEC_IDS.some((id) => head.includes(id))) return null; // webm berisi video bukan rekaman suara
    return 'audio/webm';
  }
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(4, 8) === 'ftyp' && MP4_BRANDS.has(ascii(8, 12))) return 'audio/mp4';
  return null;
}

export const EXT_BY_MIME: Record<RecordingMime, 'webm' | 'ogg' | 'm4a'> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
};
