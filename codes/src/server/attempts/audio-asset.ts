/**
 * Satu-satunya definisi "aset audio yang dapat dilayani endpoint GET /attempts/{id}/audio" (SPEC-011; QA F-11-03).
 * Dipakai endpoint (melayani) dan DTO attempt (`listening`), sehingga DTO tidak pernah menjanjikan audio yang ditolak endpoint.
 */

/** Hanya tiga tipe MIME yang boleh dilayani; varian WAV dinormalisasi. */
export const SERVED_MIME: Record<string, string> = {
  'audio/mpeg': 'audio/mpeg',
  'audio/ogg': 'audio/ogg',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
};

export interface AudioAssetLike {
  kind: string;
  mimeType: string | null;
  storageKey: string | null;
  storageBackend: string | null;
}

/** MIME yang dilayani bila aset dapat dilayani; selain itu null. */
export function servedAudioMime(asset: AudioAssetLike | null | undefined): string | null {
  if (!asset || asset.kind !== 'AUDIO_LISTENING' || asset.storageBackend === 'EXTERNAL' || !asset.storageKey || !asset.mimeType) return null;
  return SERVED_MIME[asset.mimeType] ?? null;
}
