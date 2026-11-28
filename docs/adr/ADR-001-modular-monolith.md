# ADR-001: Modular monolith with a separate worker process

- **Status:** Accepted
- **Date:** 2026-11-27

## Context

The platform is built by one developer with coding-agent help. It needs identity, a course catalogue, learning progress, assessments, an AI mentor and admin tooling, initially for about 1,000 registered learners. Operational overhead must stay low, and domain boundaries must stay clear so that parts can be extracted later if measured load or team structure ever requires it.

## Decision

- Build the backend as **one deployable NestJS API** with strict internal modules (Identity, Users, Catalog, Content, Enrollment, Progress, Assessment, Mentor, AiProvider, Notification, Analytics, Admin, Audit, Storage, Health).
- Run background work (email, content indexing, conversation summaries) in a **separate worker process** using BullMQ on Redis, reusing the same domain services. The worker is added when the first background job is needed.
- Use **PostgreSQL** as the single system of record, with pgvector for retrieval in the RAG phase.
- No microservices or Kubernetes for the MVP.

## Consequences

- One codebase, shared types, simple local setup and easy database transactions.
- Module boundaries are a code-review responsibility rather than a network boundary: modules talk through exported services, never another module's tables directly.
- Scaling is vertical plus horizontal replicas of the same API image. If one module needs independent scaling later, its service interface becomes the extraction seam, documented in a new ADR.
