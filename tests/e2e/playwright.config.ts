import { defineConfig, devices } from '@playwright/test';
import { AUTH_STATE_PATH, WEB_URL } from './support/env';

const isCI = Boolean(process.env.CI);

/**
 * Drives the real stack (SPA → nginx → API → PostgreSQL); it does not start it. See README.md.
 *
 * The API allows few logins per minute per client IP, and all browser traffic reaches it from one
 * IP, so the `setup` project signs in once and every signed-in test reuses its storage state.
 */
export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Each worker drives its own Chromium; two keep a run short without starving a laptop that also
  // hosts the Docker VM.
  workers: 2,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
      teardown: 'teardown',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Runs after every project that depends on `setup`: deletes the saved session.
      name: 'teardown',
      testMatch: /auth\.teardown\.ts$/,
    },
    {
      // Browserless HTTP checks against the API and nginx; they build their own request contexts.
      name: 'api',
      testMatch: /api\/.*\.spec\.ts$/,
      dependencies: ['setup'],
    },
    {
      name: 'desktop-chromium',
      testIgnore: [/api\//, /mobile\//],
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: AUTH_STATE_PATH,
      },
    },
    {
      name: 'mobile-chromium',
      // Phone-specific flows, plus the accessibility checks that run on both viewports.
      testMatch: [/mobile\/.*\.spec\.ts$/, /a11y\/.*\.spec\.ts$/],
      dependencies: ['setup'],
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        storageState: AUTH_STATE_PATH,
      },
    },
  ],
});
