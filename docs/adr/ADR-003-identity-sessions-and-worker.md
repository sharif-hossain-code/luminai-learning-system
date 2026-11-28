# ADR-003: Identity sessions, the email worker and API contracts

- Status: Accepted
- Date: 2026-11-27

## Context

Phase 2 adds accounts, email verification, password reset and profiles. We needed to choose how sessions work, how emails are sent without slowing requests, and how the web app and API agree on request and response shapes.

## Decisions

1. **Server-side sessions with opaque tokens**, not JWTs. A random token in an `HttpOnly` cookie maps to a hashed row in `sessions`. Revocation (sign out everywhere, password change, suspension) is immediate, and nothing sensitive lives in the browser.
2. **Same-origin proxy.** The web app forwards `/api/v1/*` to the API through a route handler that reads `API_URL` at request time. Cookies stay first-party and one web build works in every environment. A Next.js rewrite was rejected because its target is fixed at build time.
3. **CSRF by custom header plus Origin check**, rather than synchronizer tokens. It needs no token storage and fits a JSON-only API.
4. **The worker is a second entrypoint of the API app** (`apps/api/src/worker.ts`), not a separate package. It shares modules, config and Prisma, and runs BullMQ consumers only. Email jobs carry only a user ID; the worker creates tokens. `JOBS_MODE=inline` runs jobs in-process for tests; production refuses it.
5. **Contracts in `@luminai/contracts`.** Zod schemas define every request and response. The API validates with them, the web app uses them for client-side checks and types, and the OpenAPI 3.1 document is generated from the same route list. A test fails if a Nest route is missing from the document or vice versa.

## Consequences

- Every authenticated request reads the session from Postgres. If this becomes a bottleneck, cache session lookups in Redis with a short TTL.
- The web app is in the request path for every API call from the browser; it must be scaled with the API.
- Adding an endpoint means adding it to `API_ROUTES` in contracts, or the OpenAPI test fails.
