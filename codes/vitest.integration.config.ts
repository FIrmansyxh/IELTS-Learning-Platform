import path from 'node:path';
import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Muat codes/.env (jalur B: TEST_DATABASE_URL) tanpa menimpa env yang sudah ada.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/integration/**/*.itest.ts'],
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    maxWorkers: 1,
    fileParallelism: false,
    globalSetup: ['./tests/integration/global-setup.ts'],
    setupFiles: ['./tests/integration/setup-env.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
