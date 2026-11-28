# Working on this repository

- Product requirements and engineering rules: `docs/product/master-requirements.md`. Treat it as the project constitution.
- Before starting, read `docs/implementation-status.md` (where things stand and the next task) and `docs/assumptions.md`.
- Work one phase task at a time. Don't start a phase until the previous phase's exit gate passes.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and, when touching data or the API, `pnpm test:integration` before finishing. Report real results only.
- The API and packages are ESM: relative imports end in `.js`.
- Never read `.env` values or put secrets in code, logs, fixtures or docs.
- Update `docs/implementation-status.md` at the end of each task.
