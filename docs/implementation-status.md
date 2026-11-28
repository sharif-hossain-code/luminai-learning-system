# Implementation status

Last updated: 2026-11-28

## Current phase

**Phase 3: course catalogue and content. Complete, pending review (stacked on the Phase 2 pull request).**

Phases 1 and 2 are complete; their pull requests are not merged yet.

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

## Phase 2: identity and profile

Designs: Figma file `IM8Asf7gw3rlQFwBxVqJRp` (sign up/in, check email, verify, forgot/reset password, onboarding steps 1–3, settings profile and security). Exports are in the project files under `design/figma-export/`.

| Gate item (requirements §14)        | Status              | Where                                                                                                                                  |
| ----------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Registration and email verification | Done                | `POST /auth/register`, `/auth/verify-email`, `/auth/resend-verification`; `/sign-up`, `/check-email`, `/verify-email`                  |
| Login, logout, session revocation   | Done                | `/auth/login`, `/auth/logout`, `/auth/logout-all`, `/auth/sessions`, `/auth/sessions/revoke-others`; Settings → Security               |
| Password reset                      | Done                | `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`; `/forgot-password`, `/reset-password`                        |
| Profile and learning preferences    | Done                | `/users/me`, `/users/me/profile`, `/users/me/preferences`; onboarding and Settings → Profile                                           |
| RBAC guards and ownership checks    | Done                | Global `AuthGuard` with `@Roles`; `/admin/users` (list, search, role, status); every `/users/me` query is scoped to the session's user |
| Admin MFA                           | Pre-production task | Assumption A18                                                                                                                         |
| Authentication UI and validation    | Done                | Shared Zod schemas and password rules in `@luminai/contracts`                                                                          |
| Email delivery                      | Done                | BullMQ worker (`apps/api/src/worker.ts`), Mailpit for local mail                                                                       |
| OpenAPI                             | Done                | Generated from contracts at `/api/v1/openapi.json` (non-production); a test keeps it in sync with the routes                           |

Security controls are described in `docs/security/web-security.md`; decisions in ADR-003.

### Gate tests

| Required test                         | Covered by                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Correct/incorrect login               | `identity.integration.spec.ts` ("same error for a wrong password and an unknown email"), e2e "sign-in errors"                        |
| Expired/used verification token       | "rejects an expired verification link", "registers, blocks sign-in until verified, then verifies once", "invalidates the old link"   |
| Password reset single use             | "resets the password with a single-use link and signs out every session", "rejects an expired reset link"                            |
| Session revoked after logout          | "logout revokes the session", "logout-all", "revoke-others", e2e settings test                                                       |
| User A cannot access User B's profile | "only ever returns the caller's own account", "lets me revoke one, but not someone else's", "keeps each user's preferences separate" |
| Learner cannot call admin route       | "stops learners and anonymous callers", "stops content editors"                                                                      |
| Rate limiting works                   | `rate-limit.integration.spec.ts` (4 tests)                                                                                           |

### Test results (local run, 2026-11-27)

| Suite                                              | Result                                                                                                                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck` | Pass (6/6 tasks)                                                                                                                                                                                |
| `pnpm test` (unit)                                 | 30 pass (API 23, contracts 7)                                                                                                                                                                   |
| `pnpm test:integration`                            | 60 pass (database 6, API 54)                                                                                                                                                                    |
| `pnpm build`                                       | Web, API, contracts, database build                                                                                                                                                             |
| `pnpm test:e2e` (desktop + mobile)                 | 28 pass, 2 skipped by design. Covers sign-up → verify → onboarding → dashboard, sign-in errors, protected-page redirect, password reset, invalid links, profile and sessions settings, sign-out |
| `pnpm audit --prod --audit-level high`             | No known vulnerabilities                                                                                                                                                                        |

Verified against local Postgres 16 and Redis 7 (no Docker in the build environment), using installed Chrome for Playwright.

### Differences from the design

- No "Continue with Google" (A13), no session location (A16), no avatar upload or delete-account section yet (A17).
- Reset password always signs out other devices, so the design's "Sign me out on other devices" checkbox is not shown.
- Two colour tokens adjusted for contrast (A11). Input border contrast is raised with design (A15).
- The sidebar shows only Dashboard and Profile & settings; the other items arrive with their phases.

## Phase 3: course catalogue and content

Designs: the catalogue follows `designs/luminai-canvas/project/Catalog.dc.html`. Course detail and the course studio had no design, so they use the existing visual language (assumption A29). Decisions are in ADR-004; the model and workflow are described in `docs/architecture/course-content.md`.

| Gate item (requirements §14)                | Status | Where                                                                                                                     |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| Categories and course catalogue             | Done   | `GET /catalog/categories`, `GET /catalog/courses` (search, category, level, length, sort, pagination); `/courses`         |
| Course detail                               | Done   | `GET /catalog/courses/{idOrSlug}` (outline only, never lesson content); `/courses/[slug]`                                 |
| Admin course draft creation and editing     | Done   | `/admin/courses` CRUD; Course studio `/studio`, `/studio/courses/[id]`                                                    |
| Module, lesson and resource authoring       | Done   | `/admin/modules`, `/admin/lessons`, `/admin/resources`, reorder endpoints; lesson editor with blocks, live preview, links |
| Content validation and publication workflow | Done   | Draft → review → published → archived; `findPublishIssues` shown live in the editor; 422 `PUBLISH_VALIDATION_FAILED`      |
| Course version tracking                     | Done   | Immutable `course_versions` snapshots, `/admin/courses/{id}/versions`, version history in the studio                      |
| Categories management                       | Done   | `/admin/categories` (admins); `/studio/categories`                                                                        |
| Sample catalogue                            | Done   | `pnpm --filter @luminai/api seed:demo` publishes six courses through the authoring service                                |

### Gate tests

| Required test                                 | Covered by (`apps/api/test/courses.integration.spec.ts` unless noted)                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Draft courses hidden from learners            | "hides drafts and courses in review from learners and anonymous visitors", "shows a published course, and keeps later edits hidden until the next publish", "hides archived courses and lists every published version"   |
| Unauthorized editor/admin operations rejected | "rejects learners and anonymous callers on every authoring route", "stops an editor from touching another editor's course", "lets editors submit for review but not publish, archive, feature or reassign"               |
| Module and lesson order is deterministic      | "keeps module and lesson order deterministic and reorders exactly", "publishes modules and lessons in the authored order"                                                                                                |
| Publish validation blocks incomplete content  | "blocks publishing an empty course and lists what is missing", "blocks modules without lessons and lessons without content", "requires the media plus captions or a transcript for video lessons", `course-tree.spec.ts` |
| Rich text safely sanitized and rendered       | "stores typed HTML as literal text and never as markup"; `packages/contracts/src/content.spec.ts` (control characters, bidi overrides, unsafe URLs); the renderer builds React elements only                             |
| End to end                                    | `apps/web/e2e/catalog.spec.ts`, `apps/web/e2e/studio.spec.ts` (create → fix issues → publish → find in the catalogue)                                                                                                    |

### Test results (local run, 2026-11-28)

| Suite                                              | Result                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck` | Pass                                                                                                |
| `pnpm test` (unit)                                 | 60 pass (API 27, contracts 33)                                                                      |
| `pnpm test:integration`                            | 95 pass (database 10, API 85)                                                                       |
| `pnpm build`                                       | Web, API, contracts, database build                                                                 |
| `pnpm test:e2e` (desktop + mobile)                 | 36 pass, 2 skipped by design. The mobile password-reset test failed once and passed on the next run |

Verified against local Postgres 16 and Redis 7, using the preinstalled Chromium (`PLAYWRIGHT_EXECUTABLE_PATH`).

### Differences from the design

- Enrolment is not built yet (Phase 4): the course page shows "Sign up to start" to visitors and "Enrolment opens soon" to signed-in learners.
- Resources are https links only until object storage exists (A25). Cover images use the domain illustration.

## Known issues and debt

- Docker Compose not yet run (see above).
- No Content Security Policy on the web app yet (see assumption A10).
- Docker Compose now includes Mailpit; like Postgres and Redis it was written but not run here.
- The dashboard suggests three published courses from the learner's first goal; progress arrives in Phase 4.
- A course page for an unknown slug shows the not-found page with status 200 (the page streams); it is marked `noindex`.
- The mobile password-reset e2e test failed once locally and passed on re-run; watch it in CI.
- Breached-password check and admin MFA are pre-production tasks (A18, A19).
- No Dockerfiles yet: they depend on the hosting choice (assumption A5).

## Next task

**Phase 4, task 1:** enrolment and the lesson player. Learners enrol in the published version, open lessons in order, and progress is recorded against that version, with completion rules per lesson type.
