import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config.mjs';

const localChromeExecutable = process.env.WEDDING_TEST_CHROME_EXECUTABLE;
const localChromeLaunch = localChromeExecutable
  ? { launchOptions: { executablePath: localChromeExecutable } }
  : {};

export default defineConfig({
  ...baseConfig,
  testMatch: 'wedding-review-pack.spec.mjs',
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  retries: 0,
  reporter: 'line',
  use: {
    ...baseConfig.use,
    screenshot: 'off',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'review-mobile',
      grep: /@mobile-review/,
      use: { ...devices['iPhone 13'], browserName: 'chromium', ...localChromeLaunch },
    },
    {
      name: 'review-desktop',
      grep: /@desktop-review/,
      use: { ...devices['Desktop Chrome'], ...localChromeLaunch },
    },
  ],
});
