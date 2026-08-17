import { defineConfig, devices } from '@playwright/test';

const localChromeExecutable = process.env.WEDDING_TEST_CHROME_EXECUTABLE;
const localChromeLaunch = localChromeExecutable
  ? { launchOptions: { executablePath: localChromeExecutable } }
  : {};

export default defineConfig({
  testDir: './e2e',
  testIgnore: 'wedding-review-pack.spec.mjs',
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['line']] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], ...localChromeLaunch } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium', ...localChromeLaunch } },
  ],
  webServer: {
    command: 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/guest',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
