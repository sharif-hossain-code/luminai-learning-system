# ADR-002: Workspace layout and stack versions

- **Status:** Accepted
- **Date:** 2026-11-27

## Context

The requirements fix the main technologies (Next.js, NestJS, PostgreSQL, Prisma, Redis/BullMQ, pnpm + Turborepo) and ask for current, compatible, pinned versions. Several of these released major versions recently with breaking changes, so each choice below was checked against the published packages on 2026-11-27.

## Decisions

### Workspace

- **pnpm workspaces + Turborepo.** `apps/*` for deployables, `packages/*` for shared code.
- **Prisma lives in `packages/database`**, not a root `prisma/` folder as the suggested layout shows. Both the API and the future worker need the generated client, so it is packaged once with a `createPrismaClient()` factory. Migrations are in `packages/database/prisma/migrations`.
- **`packages/contracts`** holds response shapes shared by web and API as Zod schemas plus inferred types. It contains no server-only code.
- Exact versions are pinned in every `package.json`; `pnpm-lock.yaml` is committed. Only listed packages may run install scripts (`onlyBuiltDependencies`).

### Versions and the reasons for them

| Area         | Choice                                           | Note                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js      | 22 LTS (`.nvmrc`)                                | Node 24 also works                                                                                                                                                                                       |
| TypeScript   | 6.0.3                                            | 7.x is out, but `typescript-eslint` 8.74 supports `<6.1`, and NestJS CLI 12 targets 6.0                                                                                                                  |
| Next.js      | 16.4.6, React 19.3                               | App Router with Cache Components (scaffold default)                                                                                                                                                      |
| NestJS       | 12.6                                             | ESM-only. All API code is ESM with `.js` import suffixes                                                                                                                                                 |
| HTTP adapter | Fastify 5 (`@nestjs/platform-fastify`)           | As the requirements prefer. It worked cleanly with Nest 12                                                                                                                                               |
| Prisma       | 7.10.1                                           | `latest` on npm is an 8.0 release candidate, which we avoid. Prisma 7 needs the `prisma-client` generator and the `pg` driver adapter                                                                    |
| PostgreSQL   | 17 via `pgvector/pgvector:0.8.7-pg17`            | pgvector is in the image now so the RAG phase needs no image change                                                                                                                                      |
| Redis        | 8.2 (`redis:8.2.11`) locally                     | Production uses a managed Redis-compatible service                                                                                                                                                       |
| Tests        | Vitest 5 (API, packages), Playwright 1.65 (web)  | Nest 12 scaffolds Vitest. Decorator metadata works with Vite 8                                                                                                                                           |
| Lint         | ESLint + typescript-eslint, `eslint-config-next` | The requirements ask for ESLint, so the Nest scaffold's oxlint was not adopted. The web app stays on ESLint 9 because `eslint-config-next`'s plugins don't support ESLint 10 yet. Packages use ESLint 10 |
| Validation   | Zod 4                                            | Shared by config validation, contracts and (later) request DTOs                                                                                                                                          |

### Not adopted

- `@nestjs/observe` (added by the Nest scaffold): a hosted telemetry service the project hasn't chosen. Observability (Sentry/OpenTelemetry) is decided in the hardening phase.
- `next/font/google`: fonts come from the `geist` package so builds never fetch from Google.

## Consequences

- Upgrading TypeScript to 7 waits for typescript-eslint support.
- `effect` is overridden to 3.22.1 in `pnpm-workspace.yaml` to clear a high-severity advisory pulled in by `@prisma/config`. Remove the override when Prisma updates its dependency.
