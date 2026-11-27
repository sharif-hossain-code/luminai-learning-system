# Implementation status

Last updated: 2026-11-27

## Current phase

**Phase 1: development foundation. Complete, pending review of the first pull request.**

## Phase 0: inspection (done)

- The repository was empty apart from an initial commit.
- Tools used to build and verify: Node 22.23, pnpm 10.28, Git 2.43.
- The build environment had no working Docker daemon, so Postgres 16 and Redis 7 installed on the machine were used to verify migrations, seed and health checks. `docker-compose.yml` (Postgres 17 with pgvector, Redis 8.2) was written but **not run**; please run `docker compose up -d` once on a developer machine to confirm it.
- ADR-001 (modular monolith) and ADR-002 (workspace and stack) written. Assumptions are in `docs/assumptions.md`.

## Phase 1: what exists

| Task                                                | Status                | Evidence                                                                                                                                                      |
| --------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Workspace (pnpm, Turborepo, web + API scaffolds) | Done                  | `pnpm install --frozen-lockfile` from clean state                                                                                                             |
| 2. Docker Compose (Postgres + Redis)                | Written, not run here | See note above                                                                                                                                                |
| 3. API foundation                                   | Done                  | `/api/v1` prefix, Zod-validated config that fails fast, exact-origin CORS, request IDs, error envelope, Helmet headers, liveness/readiness, graceful shutdown |
| 4. Prisma baseline                                  | Done                  | `roles`, `users`, `user_profiles`, `sessions`; first migration; idempotent role seed                                                                          |
| 5. Redis connection                                 | Done                  | Readiness reports Redis; tested with Redis unavailable                                                                                                        |
| 6. Web foundation                                   | Done                  | Layout, Geist font, light/dark tokens, responsive shell, loading/error/not-found, reduced motion, `/status` page calling the API                              |
| 7. Shared contracts                                 | Done                  | `@luminai/contracts`: error envelope and health schemas                                                                                                       |
| 8. Test baseline                                    | Done                  | See below                                                                                                                                                     |
| 9. CI                                               | Done                  | `.github/workflows/ci.yml` is green on PR #1: lint, typecheck, unit, integration, build, Playwright and audit                                                 |
| 10. Docs                                            | Done                  | README, `.env.example`, ADRs, this file                                                                                                                       |

### Test results (local run, 2026-11-27)

| Suite                                          | Result                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm lint`                                    | 6/6 tasks pass                                                     |
| `pnpm typecheck`                               | 6/6 tasks pass                                                     |
| `pnpm test` (unit)                             | 23 tests pass (API 20, contracts 3)                                |
| `pnpm test:integration`                        | 15 tests pass (database 6, API 9)                                  |
| `pnpm build`                                   | Web, API, contracts, database build                                |
| `pnpm test:e2e` (Playwright, desktop + mobile) | 12 pass, 2 skipped by design (desktop-only and mobile-only checks) |
| `pnpm audit --prod --audit-level high`         | No known vulnerabilities (after the `effect` override)             |
| Deliberately failing unit test                 | `pnpm test` exits 1                                                |

## Known issues and debt

- Docker Compose not yet run (see above).
- OpenAPI/Swagger is not set up yet; the only endpoints are health checks. Add it with the first identity endpoints.
- No Content Security Policy on the web app yet (see assumption A10).
- No Dockerfiles yet: they depend on the hosting choice (assumption A5).
- No BullMQ worker yet: it is added with the first background job (verification emails in Phase 2).

## Next task

**Phase 2, task 1:** add email verification and password reset token tables, and the `POST /auth/register` endpoint with Argon2id hashing, email normalisation, rate limiting and negative tests. Set up OpenAPI documentation alongside it.
