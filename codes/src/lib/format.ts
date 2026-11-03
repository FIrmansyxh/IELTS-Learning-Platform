const dateTime = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
});
const dateOnly = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' });

/** Waktu ISO UTC dari API -> tampilan lokal Indonesia (WIB). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTime.format(d);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateOnly.format(d);
}

/** Detik -> "mm:ss" (menit boleh lebih dari 59). */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Ukuran berkas dalam KB/MB (pemisah desimal Indonesia). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

const timeWib = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" });

/** ISO UTC -> "HH:mm WIB" (zona aplikasi). */
export function formatTimeWib(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${timeWib.format(d).replace(".", ":")} WIB`;
}

/**
 * Persen skor untuk tampilan: dipotong (bukan dibulatkan) ke 2 desimal agar 84,996 tidak tampil "85"
 * saat server menyatakan belum lulus (QA F-08-04). Lulus/gagal selalu dari server, tidak dihitung ulang.
 */
export function formatScorePercent(n: number): string {
  const t = Math.floor(n * 100 + 1e-9) / 100;
  return Number.isInteger(t) ? String(t) : t.toFixed(2).replace('.', ',');
}
