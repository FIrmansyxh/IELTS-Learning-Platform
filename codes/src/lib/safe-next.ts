/**
 * Validasi parameter `next` (SPEC-001 "Redirect next"; security-standards bagian 3):
 * hanya path internal berawalan `/`, bukan `//`, tanpa `\`, panjang <= 200.
 */
export function safeNext(raw: string | null | undefined, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback;
  if (raw.length === 0 || raw.length > 200) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (raw.includes('\\')) return fallback;
  // karakter kontrol atau skema tersembunyi (mis. "/\t/evil")
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  return raw;
}
