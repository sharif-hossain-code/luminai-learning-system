import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against production builds of the web app and the API.
 * Run `pnpm build` first (CI does this). Needs Postgres and Redis; the API uses
 * TEST_DATABASE_URL, so don't run this at the same time as `pnpm test:integration`.
 */

const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const WEB_PORT = 3100;
const API_PORT = 4100;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const MAIL_SINK_URL = 'http://127.0.0.1:3125';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to run the end-to-end tests.`);
  return value;
}

const apiEnv = {
  NODE_ENV: 'test',
  API_PORT: String(API_PORT),
  WEB_URL,
  DATABASE_URL: required('TEST_DATABASE_URL'),
  REDIS_URL: required('REDIS_URL'),
  SESSION_SECRET: required('SESSION_SECRET'),
  EMAIL_TRANSPORT: 'smtp',
  SMTP_URL: 'smtp://127.0.0.1:1125',
  JOBS_MODE: 'inline',
  // Rate limits have their own integration tests; e2e runs many sign-ups from one address.
  RATE_LIMIT_ENABLED: 'false',
  LOG_LEVEL: 'warn',
  PATH: process.env.PATH ?? '',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    // Optional: use an installed browser instead of Playwright's (e.g. PLAYWRIGHT_CHANNEL=chrome).
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    // Or point at a browser binary directly (e.g. a preinstalled Chromium).
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } }
      : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node e2e/support/mail-sink.ts',
      url: `${MAIL_SINK_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      // Migrate and seed the test database, load the demo catalogue, then start the built API.
      command:
        'pnpm --dir ../../packages/database exec prisma migrate deploy && pnpm --dir ../../packages/database exec prisma db seed && node ../api/dist/scripts/seed-demo-courses.js && node ../api/dist/main.js',
      url: `http://localhost:${API_PORT}/api/v1/health/live`,
      env: apiEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm exec next start --port ${WEB_PORT}`,
      url: WEB_URL,
      env: { API_URL: `http://localhost:${API_PORT}`, PATH: process.env.PATH ?? '' },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
