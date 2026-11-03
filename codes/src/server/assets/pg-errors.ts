/** Ambil kode/constraint galat unik Postgres (drizzle membungkus galat pg di `cause`). */
export function uniqueViolation(e: unknown): string | null {
  const x = e as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } } | null;
  const code = x?.code ?? x?.cause?.code;
  if (code !== '23505') return null;
  return x?.constraint ?? x?.cause?.constraint ?? '';
}
/** Pelanggaran kunci asing RESTRICT (23503). */
export function fkViolation(e: unknown): boolean {
  const x = e as { code?: string; cause?: { code?: string } } | null;
  return (x?.code ?? x?.cause?.code) === '23503';
}
