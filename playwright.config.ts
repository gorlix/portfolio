import { defineConfig, devices } from '@playwright/test';

const port = 4321;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `pnpm build && pnpm preview --port ${port} --ignore-lock`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      // Suite con JavaScript disattivato: ingresso, recruiter e agent devono funzionare cosi.
      name: 'no-js',
      testMatch: /.*\.nojs\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], javaScriptEnabled: false },
    },
    {
      name: 'chromium',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /.*\.nojs\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
