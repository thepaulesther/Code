import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests: real journeys, data safety, offline, layout and accessibility, run against the
 * production build (`vite preview`), the same files users get. Exchange-rate requests are blocked
 * (see e2e/fixtures.ts), so tests are repeatable and need no network.
 */
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // Evidence only when something fails, so passing runs stay fast.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});
