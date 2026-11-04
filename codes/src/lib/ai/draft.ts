/**
 * Draf lokal tulisan (SPEC-012), terikat pengguna (F-12-04):
 * `draft:v1:{user_id}:{attempt_id|sub_module_id}:{question_id|mini}` dengan nilai `{t, v}` (waktu simpan + teks).
 * Draf kedaluwarsa setelah `DRAFT_TTL_MS`. Tanpa `userId` kunci kosong: tidak ada yang dibaca/ditulis.
 * Semua kunci `draft:v1:` dan `ai-sub:v1:` dihapus saat logout/401 lewat `clearExamStorage` (lib/reading/storage).
 */
export const DRAFT_PREFIX = 'draft:v1:';
export const ACTIVE_SUB_PREFIX = 'ai-sub:v1:';
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Ctx = { userId?: string | null; attemptId?: string | null; subModuleId?: string | null; questionId?: string | null };

export function draftKey(ctx: Ctx): string {
  if (!ctx.userId) return '';
  return `${DRAFT_PREFIX}${ctx.userId}:${ctx.attemptId ?? ctx.subModuleId ?? 'none'}:${ctx.questionId ?? 'mini'}`;
}

/** Kunci id submission aktif, juga terikat pengguna. `suffix` dipakai Mini-Task (`mini`, `mini-speaking`). */
export function activeSubKey(ctx: Ctx & { suffix?: string }): string {
  if (!ctx.userId) return '';
  return `${ACTIVE_SUB_PREFIX}${ctx.userId}:${ctx.attemptId ?? ctx.subModuleId ?? 'none'}:${ctx.questionId ?? ctx.suffix ?? 'mini'}`;
}

export function loadDraft(key: string, now: number = Date.now()): string {
  if (!key) return '';
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const p = parsed as { t?: unknown; v?: unknown } | null;
    if (!p || typeof p.t !== 'number' || typeof p.v !== 'string' || now - p.t > DRAFT_TTL_MS || p.t > now + 60_000) {
      window.localStorage.removeItem(key); // format lama / kedaluwarsa
      return '';
    }
    return p.v;
  } catch {
    return '';
  }
}

/** Mengembalikan false bila penyimpanan diblokir; UI tetap berfungsi tanpa draf. */
export function saveDraft(key: string, value: string, now: number = Date.now()): boolean {
  if (!key) return false;
  try {
    if (value) window.localStorage.setItem(key, JSON.stringify({ t: now, v: value }));
    else window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

/** Buang draf kedaluwarsa/rusak (dipanggil saat editor dimuat). */
export function pruneExpiredDrafts(now: number = Date.now()): void {
  try {
    const ls = window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k?.startsWith(DRAFT_PREFIX)) keys.push(k);
    }
    for (const k of keys) loadDraft(k, now);
  } catch {
    /* penyimpanan tidak tersedia */
  }
}
