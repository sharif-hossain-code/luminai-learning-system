# Test strategy

| Level           | Tool       | Location                                                   | Command                       | Needs                                                                                |
| --------------- | ---------- | ---------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| Unit            | Vitest     | `apps/api/src/**/*.spec.ts`, `packages/*/src/**/*.spec.ts` | `pnpm test`                   | Nothing                                                                              |
| Integration     | Vitest     | `packages/database/test`, `apps/api/test`                  | `pnpm test:integration`       | Postgres + Redis, `TEST_DATABASE_URL`                                                |
| Web smoke (E2E) | Playwright | `apps/web/e2e`                                             | `pnpm build && pnpm test:e2e` | A Playwright browser (`pnpm --filter @luminai/web exec playwright install chromium`) |

## Integration test isolation

`packages/database/test/global-setup.ts` drops and recreates the `public` schema of `TEST_DATABASE_URL`, then applies all migrations. It refuses to run unless the database name contains `test` and differs from `DATABASE_URL`.

## Rules

- Every user-owned resource gets negative authorisation tests (User A cannot read or change User B's data) from Phase 2 onward.
- Never skip or weaken a test to get a green build.
- If you can't use Playwright's own browser, set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome.

## Dependency audit policy

CI runs `pnpm audit --prod --audit-level high`. High and critical advisories in production dependencies fail the build. Fix by upgrading; if no fix exists upstream, a scoped `overrides` entry in `pnpm-workspace.yaml` with a comment and removal condition is acceptable.
