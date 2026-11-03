/**
 * Ringkasan galat yang AMAN untuk log (QA F-01). `err.message` TIDAK pernah dicatat: DrizzleQueryError membawa
 * SQL + nilai parameter (email, password_hash, ...). Hanya name, kode (mis. SQLSTATE) dan frame stack (tanpa baris pesan).
 */
export function safeErr(err: unknown): { name: string; code?: string; stack?: string } {
  if (!(err instanceof Error)) return { name: typeof err };
  const code = (err as { code?: unknown }).code ?? (err.cause as { code?: unknown } | undefined)?.code;
  const frames = (err.stack ?? '')
    .split('\n')
    .filter((l) => /^\s+at /.test(l))
    .slice(0, 8)
    .join('\n');
  return { name: err.name, ...(typeof code === 'string' ? { code } : {}), ...(frames ? { stack: frames } : {}) };
}
