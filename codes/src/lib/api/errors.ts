import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { fmt, id } from '@/i18n/id';
import { ApiError, isApiError } from './client';

/** Pesan Indonesia untuk galat apa pun: kode terdaftar di kamus, selain itu pesan generik. */
export function apiErrorMessage(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === 'RATE_LIMITED' && e.retryAfterSec) {
      return fmt(id.common.rateLimited, { n: Math.max(1, Math.ceil(e.retryAfterSec / 60)) });
    }
    return id.apiErrors[e.code] ?? id.apiErrors.UNKNOWN;
  }
  return id.common.unexpected;
}

/** Pesan satu `details[]`: kode terdaftar dulu, jika tidak pesan server (sudah Indonesia). */
export function detailMessage(code: string, serverMessage: string): string {
  return id.fieldErrors[code] ?? serverMessage;
}

/**
 * Memetakan `details[]` VALIDATION_ERROR ke field RHF. Mengembalikan jumlah field yang
 * berhasil dipetakan; sisa (path tak dikenal) menjadi pesan umum bagi pemanggil.
 */
export function applyValidationDetails<T extends FieldValues>(
  e: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): number {
  if (!isApiError(e) || e.code !== 'VALIDATION_ERROR') return 0;
  let mapped = 0;
  for (const d of e.details) {
    const root = d.path.split('.')[0] ?? '';
    if (fields.includes(root)) {
      setError(root as Path<T>, { type: 'server', message: detailMessage(d.code, d.message) });
      mapped += 1;
    }
  }
  return mapped;
}

export { ApiError };
