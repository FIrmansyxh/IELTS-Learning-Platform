import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  retries: isCI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
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
        url: 'http://127.0.0.1:3000/api/health',
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
});
