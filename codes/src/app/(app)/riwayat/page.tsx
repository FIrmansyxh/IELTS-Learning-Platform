import { redirect } from 'next/navigation';

/** `/riwayat` dialihkan ke tab pertama (SPEC-017). */
export default function HistoryIndexPage() {
  redirect('/riwayat/ujian');
}
