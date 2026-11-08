/** Pembacaan konfigurasi server dari env (lazy, tanpa process.exit agar mudah diuji). */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Konfigurasi env tidak valid: ${name}`);
  return v;
}

export const config = {
  authSecret: () => req('AUTH_SECRET'),
  authUrl: () => process.env.AUTH_URL ?? 'http://localhost:3000',
  ipHmacSecret: () => req('IP_HMAC_SECRET'),
  trustHost: () => process.env.AUTH_TRUST_HOST === 'true',
  allowedHosts: (): string[] =>
    [process.env.ALLOWED_HOSTS ?? '', new URL(process.env.AUTH_URL ?? 'http://localhost:3000').host]
      .join(',')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  secureCookie: () => (process.env.AUTH_URL ?? '').startsWith('https://'),
  assetsDir: () => process.env.ASSETS_DIR ?? './data/assets',
  aiEnabled: () => process.env.AI_ENABLED === 'true',
  /** Penilaian Speaking otomatis (STT+LLM). Default aktif; MVP (ADR-004) mematikannya lewat `.env` (false). */
  speakingAiEnabled: () => process.env.SPEAKING_AI_ENABLED !== 'false',
  isProd: () => process.env.NODE_ENV === 'production',
};
