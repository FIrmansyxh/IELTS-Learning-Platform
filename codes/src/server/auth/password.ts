import { randomBytes, randomInt } from 'node:crypto';
import { hash, verify, type Algorithm } from '@node-rs/argon2';
import { PASSWORD_MAX, PASSWORD_MIN, passwordLength } from '@/contracts/auth';
import { isCommonPassword } from './common-passwords';

const ARGON = { algorithm: 2 as Algorithm /* Argon2id; const enum tidak dapat diakses dengan isolatedModules */, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const normalizePassword = (p: string) => p.normalize('NFKC');

export async function hashPassword(plain: string): Promise<string> {
  return hash(normalizePassword(plain), ARGON);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, normalizePassword(plain));
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/** Verifikasi terhadap hash dummy agar waktu respons seragam bila akun tidak ada/terkunci. */
export async function dummyVerify(plain: string): Promise<void> {
  dummy ??= hashPassword(randomBytes(24).toString('hex'));
  await verifyPassword(await dummy, plain);
}

export type PasswordPolicyCode =
  | 'password_too_short'
  | 'password_too_long'
  | 'password_too_common'
  | 'password_same_as_email';

/** Aturan kebijakan password SPEC-001; null = lolos. */
export function checkPasswordPolicy(password: string, email: string): PasswordPolicyCode | null {
  const n = passwordLength(password);
  if (n < PASSWORD_MIN) return 'password_too_short';
  if (n > PASSWORD_MAX) return 'password_too_long';
  const norm = normalizePassword(password).toLowerCase();
  if (isCommonPassword(norm)) return 'password_too_common';
  if (norm === normalizePassword(email.trim()).toLowerCase()) return 'password_same_as_email';
  return null;
}

const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
/** Password sementara 16 karakter dari CSPRNG (SPEC-002). */
export function generateTemporaryPassword(): string {
  let s = '';
  for (let i = 0; i < 16; i++) s += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return s;
}
