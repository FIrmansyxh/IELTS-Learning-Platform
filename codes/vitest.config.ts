import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig memakai jsx=preserve (Next); vitest perlu runtime JSX otomatis untuk uji komponen.
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    globals: false,
    testTimeout: 30_000, // impor dinamis route (Next+DB) bisa lambat saat suite paralel
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}', 'tests/security/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'tests/e2e/**', 'tests/integration/**'],
    // jsdom hanya untuk komponen; server memakai node.
    environment: 'node',
    environmentMatchGlobs: [['src/components/**', 'jsdom']],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/server/**'],
      // Modul yang terikat Postgres diverifikasi oleh `npm run test:integration` (DB nyata), bukan oleh coverage unit.
      // Logika murni (rules, validate, session, password, withApi, rate-limit, registry, assets) tetap kena ambang 70%.
      exclude: [
        'src/server/admin/**',
        'src/server/audit.ts',
        'src/server/db.ts',
        'src/server/hooks-register.ts',
        'src/server/auth/{service,guards,bootstrap}.ts',
        'src/server/content/{apply,import-service,plan,publish}.ts',
        'src/server/gatekeeping/{service,tree}.ts',
        'src/server/settings/service.ts',
      ],
      thresholds: { lines: 70 },
    },
  },
});
