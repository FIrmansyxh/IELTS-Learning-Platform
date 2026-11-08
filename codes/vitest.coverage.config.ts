import path from 'node:path';
import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/**
 * Coverage GABUNGAN (unit + integrasi) dalam satu run: `npm run coverage`.
 * Modul terikat DB hanya diuji suite integrasi, jadi mengukur unit saja menyesatkan.
 * Di sini TIDAK ada coverage.exclude: semua berkas src/server/** terhitung apa adanya.
 * `npm test` dan `npm run test:integration` tetap memakai konfigurasi masing-masing (tidak berubah).
 */
if (existsSync('.env')) process.loadEnvFile('.env');

const alias = { '@': path.resolve(__dirname, 'src') };

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/server/**'],
      thresholds: { lines: 70 },
    },
    projects: [
      {
        esbuild: { jsx: 'automatic' },
        resolve: { alias },
        test: {
          name: 'unit',
          globals: false,
          testTimeout: 30_000,
          include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}', 'tests/security/**/*.test.{ts,tsx}'],
          exclude: ['node_modules', 'tests/e2e/**', 'tests/integration/**'],
          environment: 'node',
          environmentMatchGlobs: [['src/components/**', 'jsdom']],
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.itest.ts'],
          environment: 'node',
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          globalSetup: ['./tests/integration/global-setup.ts'],
          setupFiles: ['./tests/integration/setup-env.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
