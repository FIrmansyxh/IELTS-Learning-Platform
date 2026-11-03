import { createHash, randomInt } from 'node:crypto';

export const INVITE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Kode mentah `XXXX-XXXX-XXXX-XXXX-XXXX` (20 karakter Crockford base32, CSPRNG). */
export function generateInviteCode(): string {
  let raw = '';
  for (let i = 0; i < 20; i++) raw += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return raw.match(/.{4}/g)!.join('-');
}

/** Huruf besar, tanpa '-'. */
export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/-/g, '');
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(normalizeInviteCode(code)).digest('hex');
}
