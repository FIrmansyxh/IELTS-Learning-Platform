/**
 * Deteksi magic bytes dan validasi audio untuk Speaking (SPEC-013).
 */
import { ApiError } from '../http/errors';

export type SupportedAudioMime = 'audio/webm' | 'audio/ogg' | 'audio/mp4';

export interface AudioValidationResult {
  mimeType: SupportedAudioMime;
  extension: 'webm' | 'ogg' | 'm4a';
}

export const UPLOAD_MAX_BYTES_RECORDING = 10 * 1024 * 1024; // 10 MB
export const UPLOAD_MIN_BYTES_RECORDING = 1024; // 1 KB

/**
 * Deteksi MIME type dari magic bytes awal buffer audio.
 */
export function detectAudioMime(buffer: Buffer): AudioValidationResult {
  if (buffer.length < 4) {
    throw new ApiError('UNSUPPORTED_AUDIO_TYPE', {
      message: 'Format rekaman tidak didukung.',
    });
  }

  // 1. WebM: EBML header (1A 45 DF A3)
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return { mimeType: 'audio/webm', extension: 'webm' };
  }

  // 2. Ogg: 'OggS' (4F 67 67 53)
  if (
    buffer[0] === 0x4f &&
    buffer[1] === 0x67 &&
    buffer[2] === 0x67 &&
    buffer[3] === 0x53
  ) {
    return { mimeType: 'audio/ogg', extension: 'ogg' };
  }

  // 3. MP4 / M4A: 'ftyp' at offset 4
  if (buffer.length >= 8) {
    const ftyp = buffer.subarray(4, 8).toString('ascii');
    if (ftyp === 'ftyp') {
      return { mimeType: 'audio/mp4', extension: 'm4a' };
    }
  }

  throw new ApiError('UNSUPPORTED_AUDIO_TYPE', {
    message: 'Format rekaman tidak didukung.',
  });
}
