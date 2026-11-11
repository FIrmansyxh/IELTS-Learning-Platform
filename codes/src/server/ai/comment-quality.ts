/**
 * Deteksi komentar evaluasi Writing yang generik atau berupa placeholder (ADR-004, addendum uji langsung).
 *
 * Model lokal (gpt-oss-20b) kadang mengisi `comment_id` dengan label kosong seperti "Komentar mengenai pencapaian
 * tugas" atau pengenal seperti "K1" / "komentar1", padahal bagian lain berisi konten. Komentar bernada meta yang
 * tetap memuat penilaian ("Komentar mengenai pencapaian tugas menunjukkan bahwa surat tidak memenuhi ...") dianggap
 * sah: yang ditolak hanyalah komentar tanpa isi.
 */
import type { WritingEvaluationOutput } from '@/contracts/ai';

/** Kata-kata yang menandakan kalimat memuat penilaian, bukan sekadar label. */
const CONTENT_CONNECTIVES = /\b(bahwa|karena|sehingga|namun|tetapi|yaitu|yakni|seperti|meskipun|walaupun|agar|dengan|sudah|belum|masih|kurang|baik|jelas|tidak|perlu)\b/i;
const LABEL_START = /^(komentar|keterangan|penilaian|analisis|catatan|evaluasi|ulasan)\s+(mengenai|tentang|terhadap|untuk|atas|pada)\b/i;
const IDENTIFIER = /^[A-Za-z]{1,12}[-_ ]?\d+([-_.]\d+)*[.:]?$/;

export function isGenericComment(text: string): boolean {
  const s = text.trim();
  if (!s) return true;
  const words = s.split(/\s+/);
  if (words.length < 3) return true;
  if (IDENTIFIER.test(s) || (words.length === 1 && /_/.test(s))) return true;
  // Label saja ("Komentar mengenai pencapaian tugas"): tanpa kata yang menandakan penilaian.
  if (LABEL_START.test(s) && words.length <= 12 && !CONTENT_CONNECTIVES.test(s.replace(LABEL_START, ''))) return true;
  return false;
}

/** Jalur (path) bidang prosa yang generik; kosong bila semua komentar berisi. */
export function findGenericComments(out: WritingEvaluationOutput): string[] {
  const bad: string[] = [];
  const check = (path: string, text: string) => {
    if (isGenericComment(text)) bad.push(path);
  };
  for (const [name, c] of Object.entries(out.criteria)) check(`criteria.${name}.comment_id`, c.comment_id);
  out.strengths_id.forEach((t, i) => check(`strengths_id[${i}]`, t));
  out.improvements_id.forEach((t, i) => check(`improvements_id[${i}]`, t));
  out.corrections.forEach((c, i) => check(`corrections[${i}].reason_id`, c.reason_id));
  return bad;
}
