import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  // Dev server mengompilasi halaman saat dibuka pertama kali: beri ruang di atas bawaan 5 detik.
  expect: { timeout: 15_000 },
  globalSetup: './tests/e2e/global-setup.ts',
  workers: 1, // satu DB bersama: pemilih profil auto-masuk bila hanya ada 1 profil
  retries: isCI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3005',
    launchOptions: process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {},
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm run dev',
        // E2E deterministik: tanpa whisper/LLM asli. Speaking memakai jalur prompt eksternal (SPEC-013 addendum
        // 2026-11-11 kriteria c); jalur rekam lokal diuji lewat tes unit/integrasi dan uji langsung.
        env: { ...process.env, SPEAKING_AI_ENABLED: 'false' } as Record<string, string>,
        url: 'http://127.0.0.1:3005/api/health',
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
});
