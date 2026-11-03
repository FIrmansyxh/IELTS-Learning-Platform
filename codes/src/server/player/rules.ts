/** Aturan murni SPEC-005 (D-LEARN) tanpa akses DB agar dapat diuji unit. */
export type Subtab = 'ARTICLE' | 'VIDEO' | 'SLIDES';
export const ALL_SUBTABS: readonly Subtab[] = ['ARTICLE', 'VIDEO', 'SLIDES'];
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Penambahan detik aktif per ping: `min(active_seconds, 30, elapsed)`; ping pertama `min(active_seconds, 5)`.
 * Klaim klien di atas batas dipotong tanpa error. `elapsed` = detik utuh (dibulatkan ke bawah) sejak ping terakhir (>= 0).
 * Karena tiap delta <= elapsed, total detik aktif <= waktu dinding sejak ping pertama + 5 detik (telescoping), sehingga
 * salvo ping beruntun tidak dapat menambah waktu (F-05-01; sebelumnya `elapsed + 2` per ping bocor 2 detik/ping).
 */
export function learnDelta(activeSeconds: number, lastPingAt: Date | null, now: Date): number {
  const claimed = Math.max(0, Math.min(Math.trunc(activeSeconds), 30));
  if (lastPingAt === null) return Math.min(claimed, 5);
  const elapsed = Math.max(0, Math.floor((now.getTime() - lastPingAt.getTime()) / 1000));
  return Math.min(claimed, elapsed);
}

/** Gabungkan sub-tab tanpa duplikat, urutan kanonis ARTICLE, VIDEO, SLIDES. */
export function mergeSubtabs(current: readonly string[], add: Subtab): Subtab[] {
  const set = new Set<string>([...current, add]);
  return ALL_SUBTABS.filter((s) => set.has(s));
}

export interface LearnCheckInput {
  activeSeconds: number;
  visited: readonly string[];
  minSeconds: number;
  hasVideos: boolean;
  hasSlides: boolean;
}
export interface LearnCheckIssue {
  path: string;
  code: 'insufficient_active_time' | 'subtab_not_visited';
  message: string;
}
const SUBTAB_LABEL: Record<Subtab, string> = { ARTICLE: 'Artikel', VIDEO: 'Video', SLIDES: 'Slide' };

/** `learn_ready` = waktu aktif cukup DAN seluruh sub-tab yang punya konten sudah dikunjungi. */
export function checkLearnReady(i: LearnCheckInput): { ready: boolean; issues: LearnCheckIssue[] } {
  const issues: LearnCheckIssue[] = [];
  if (i.activeSeconds < i.minSeconds) {
    issues.push({
      path: 'learn_active_seconds',
      code: 'insufficient_active_time',
      message: `Waktu belajar aktif minimal ${i.minSeconds} detik (sekarang ${i.activeSeconds}).`,
    });
  }
  const required: Subtab[] = ['ARTICLE'];
  if (i.hasVideos) required.push('VIDEO');
  if (i.hasSlides) required.push('SLIDES');
  for (const tab of required) {
    if (!i.visited.includes(tab)) {
      issues.push({ path: 'learn_visited_subtabs', code: 'subtab_not_visited', message: `Buka tab ${SUBTAB_LABEL[tab]} terlebih dahulu.` });
    }
  }
  return { ready: issues.length === 0, issues };
}

/** Nama berkas unduhan aman: huruf kecil ASCII, angka, tanda hubung. */
export function slugifyTitle(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'dokumen';
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Hanya tipe ini yang boleh dilayani oleh `GET /assets/{id}/file` (SPEC-005). */
export const SERVABLE_MIMES: Record<string, { ext: string; inline: boolean }> = {
  'image/webp': { ext: 'webp', inline: true },
  'image/png': { ext: 'png', inline: true },
  'image/jpeg': { ext: 'jpg', inline: true },
  'application/pdf': { ext: 'pdf', inline: false },
  [DOCX_MIME]: { ext: 'docx', inline: false },
};

/** Cocokkan header If-None-Match (daftar, `*`, validator lemah) dengan ETag kuat. */
export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  const h = header.trim();
  if (h === '*') return true;
  return h.split(',').some((t) => t.trim().replace(/^W\//, '') === etag);
}
