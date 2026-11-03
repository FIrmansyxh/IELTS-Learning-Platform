/** Validasi env di proses web saat start (QA F-02): rahasia pendek / konfigurasi salah menghentikan proses. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { getEnv } = await import('./server/env');
    getEnv();
  }
}
