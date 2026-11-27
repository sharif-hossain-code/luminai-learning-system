# Test strategy

| Level       | Tool       | Location                                                   | Command                       | Needs                                                       |
| ----------- | ---------- | ---------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------- |
| Unit        | Vitest     | `apps/api/src/**/*.spec.ts`, `packages/*/src/**/*.spec.ts` | `pnpm test`                   | Nothing                                                     |
| Integration | Vitest     | `packages/database/test`, `apps/api/test`                  | `pnpm test:integration`       | Postgres + Redis, `TEST_DATABASE_URL`                       |
| End-to-end  | Playwright | `apps/web/e2e`                                             | `pnpm build && pnpm test:e2e` | A Playwright browser, Postgres + Redis, `TEST_DATABASE_URL` |

## Integration test isolation

`packages/database/test/global-setup.ts` drops and recreates the `public` schema of `TEST_DATABASE_URL`, then applies all migrations. It refuses to run unless the database name contains `test` and differs from `DATABASE_URL`.

## End-to-end setup

`apps/web/playwright.config.ts` starts three servers: a test-only mail sink (`e2e/support/mail-sink.ts`, SMTP on 1125 and an HTTP endpoint on 3125 that tests read links from), the built API on port 4100 against `TEST_DATABASE_URL` (it runs `migrate deploy` and the seed first) and the built web app on port 3100. Jobs run inline and rate limits are off in this mode; rate limits have their own integration tests. Every test uses fresh, unique accounts, so tests run in parallel on desktop and mobile viewports.

Next.js keeps recently visited pages mounted but hidden. Use role-based locators (which skip hidden elements) or add `.filter({ visible: true })` to `getByLabel`.

## Rules

- Every user-owned resource gets negative authorisation tests (User A cannot read or change User B's data) from Phase 2 onward.
- Never skip or weaken a test to get a green build.
- If you can't use Playwright's own browser, set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome.

## Dependency audit policy

CI runs `pnpm audit --prod --audit-level high`. High and critical advisories in production dependencies fail the build. Fix by upgrading; if no fix exists upstream, a scoped `overrides` entry in `pnpm-workspace.yaml` with a comment and removal condition is acceptable.
