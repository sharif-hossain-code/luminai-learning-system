# Luminai Learning System

A self-paced learning platform for language, communication and leadership skills, with a private AI mentor for every learner.

The full product requirements are in [`docs/product/master-requirements.md`](docs/product/master-requirements.md). Current progress is in [`docs/implementation-status.md`](docs/implementation-status.md).

## Architecture at a glance

| Path                 | What it is                                                         |
| -------------------- | ------------------------------------------------------------------ |
| `apps/web`           | Next.js 16 web app (App Router, React 19, Tailwind CSS 4)          |
| `apps/api`           | NestJS 12 API on Fastify, a modular monolith under `/api/v1`       |
| `packages/database`  | Prisma 7 schema, migrations, seed and the shared Prisma client     |
| `packages/contracts` | Response shapes shared by web and API (Zod schemas)                |
| `docker-compose.yml` | Local PostgreSQL 17 (with pgvector) and Redis                      |
| `docs/`              | Architecture, ADRs, design tokens, testing, status and assumptions |

See [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md) and the ADRs in [`docs/adr`](docs/adr).

## Prerequisites

- **Node.js 22** (see `.nvmrc`; Node 24 also works)
- **pnpm 10.28+**: run `corepack enable` once and the version in `package.json` is used automatically
- **Docker** with Docker Compose v2 (Docker Desktop on Windows and macOS)
- Git

## First-time setup

```bash
pnpm install

# Create your local environment file, then replace every CHANGE_ME value.
# Use the same passwords in POSTGRES_PASSWORD/REDIS_PASSWORD and in the URLs.
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env

docker compose up -d          # start PostgreSQL and Redis
docker compose ps             # both should show "healthy"

pnpm db:migrate               # apply migrations to the development database
pnpm db:seed                  # create the LEARNER, CONTENT_EDITOR and ADMIN roles (safe to re-run)
```

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Running

```bash
pnpm dev
```

- Web: http://localhost:3000. The **System status** page shows whether the web app can reach the API.
- API liveness: http://localhost:4000/api/v1/health/live
- API readiness: http://localhost:4000/api/v1/health/ready

## Everyday commands

| Command                             | What it does                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm dev`                          | Run web and API in watch mode                                                       |
| `pnpm build`                        | Build every package and app                                                         |
| `pnpm lint`                         | ESLint everywhere                                                                   |
| `pnpm typecheck`                    | TypeScript in strict mode everywhere                                                |
| `pnpm test`                         | Unit tests                                                                          |
| `pnpm test:integration`             | Integration tests against the test database (`TEST_DATABASE_URL`) and Redis         |
| `pnpm test:e2e`                     | Playwright smoke tests on desktop and mobile viewports (run `pnpm build` first)     |
| `pnpm format` / `pnpm format:check` | Prettier                                                                            |
| `pnpm db:migrate`                   | Create and apply a migration after editing `packages/database/prisma/schema.prisma` |
| `pnpm db:migrate:deploy`            | Apply committed migrations without creating new ones (CI and deployments)           |
| `pnpm db:seed`                      | Seed reference data                                                                 |

Before the first `pnpm test:e2e`, install the browser once: `pnpm --filter @luminai/web exec playwright install chromium`.

## Troubleshooting

| Problem                                                  | Fix                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API exits with `Invalid environment configuration`       | The message lists each missing or invalid variable. Fix them in `.env`                                                                                                                                                                                                   |
| `docker compose up` says `Set POSTGRES_PASSWORD in .env` | `.env` is missing or still has no password. Copy `.env.example` and fill it in                                                                                                                                                                                           |
| Readiness returns 503 with `database: down`              | Postgres isn't running or `DATABASE_URL` credentials don't match `POSTGRES_PASSWORD`. Check `docker compose ps` and `docker compose logs postgres`                                                                                                                       |
| Readiness returns 503 with `redis: down`                 | Check `docker compose logs redis` and that the password in `REDIS_URL` matches `REDIS_PASSWORD`                                                                                                                                                                          |
| Port 5432 or 6379 already in use                         | Stop the other service, or change `POSTGRES_PORT`/`REDIS_PORT` and the matching URLs in `.env`                                                                                                                                                                           |
| Integration tests refuse to run                          | `TEST_DATABASE_URL` must point to a database whose name contains `test`. The `luminai_test` database is created the first time the Postgres container starts; if you created the volume before this, run `docker compose exec postgres createdb -U luminai luminai_test` |
| Changed the Postgres password after first start          | The volume keeps the old one. Reset local data with `docker compose down -v` (this deletes local databases)                                                                                                                                                              |

## Contributing

- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:` …).
- Never commit `.env` or real credentials. `.env.example` holds placeholders only.
- Each change ships with tests, and authorisation changes ship with negative tests.
- Record architecture decisions as ADRs in `docs/adr` and reversible defaults in `docs/assumptions.md`.
