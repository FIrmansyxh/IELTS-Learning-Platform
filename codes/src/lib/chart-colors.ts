/**
 * Warna diagram (dashboard, radar, riwayat). Nilainya token CSS `--chart-1..6` di globals.css yang
 * punya varian terang dan gelap, sehingga diagram otomatis menyesuaikan tema.
 */
export const SKILL_COLOR: Record<string, string> = {
  LISTENING: 'var(--chart-1)',
  READING: 'var(--chart-2)',
  WRITING: 'var(--chart-3)',
  SPEAKING: 'var(--chart-4)',
  GRAMMAR: 'var(--chart-5)',
  VOCAB: 'var(--chart-6)',
};

/** Warna per tier kurikulum (Tier 1 sampai 4). */
export const TIER_COLOR: Record<number, string> = {
  1: 'var(--chart-5)',
  2: 'var(--chart-1)',
  3: 'var(--chart-2)',
  4: 'var(--chart-4)',
};
