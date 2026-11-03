// Setup global Vitest unit. Ditambah matcher jest-dom hanya bila lingkungan DOM tersedia.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  // vitest tanpa globals: pembersihan DOM antar-tes harus didaftarkan manual.
  const { cleanup } = await import('@testing-library/react');
  const { afterEach } = await import('vitest');
  afterEach(() => cleanup());
}

// Env minimal agar modul server (sesi, hash IP, CSRF) berjalan di unit test tanpa .env.
process.env.AUTH_SECRET ??= 'unit-test-auth-secret-0123456789abcdef-xyz';
process.env.AUTH_URL ??= 'http://localhost:3000';
process.env.ALLOWED_HOSTS ??= 'localhost:3000,127.0.0.1:3000';
process.env.IP_HMAC_SECRET ??= 'unit-test-ip-hmac-secret-0123456789abcdef';
process.env.AUTH_TRUST_HOST ??= 'true';
process.env.LOG_LEVEL ??= 'silent';

export {};
