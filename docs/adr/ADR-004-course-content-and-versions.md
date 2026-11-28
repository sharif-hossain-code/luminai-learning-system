# ADR-004: Course content as structured blocks, with immutable published versions

- Status: Accepted
- Date: 2026-11-28

## Context

Phase 3 adds the course catalogue and authoring. Editors change courses while learners are taking them, published content must be reviewable and reproducible, and lesson text has to be safe to render without trusting what editors type.

## Decisions

1. **A working copy plus immutable snapshots.** Editors change `courses`, `modules`, `lessons` and `lesson_resources` directly (the working copy). Publishing writes the whole tree as JSON into a new `course_versions` row (version N+1) and points `courses.published_version_id` at it. The public catalogue reads only that snapshot, so drafts never leak and a later edit can't change what learners already see. Phase 4 progress will reference the version a learner enrolled in.
2. **Lesson content is structured blocks, never HTML.** A lesson is `{ schemaVersion: 1, blocks: [...] }` with eight block types (heading, paragraph, list, callout, quote, example, reflection, divider). Rich text is an array of spans with `bold`, `italic` and an optional `href`. Editors type a small inline markdown subset (`**bold**`, `*italic*`, `[text](https://…)`) which is parsed to spans on save. The web app renders spans as React elements, so there is no `dangerouslySetInnerHTML` and no HTML sanitiser to keep up to date.
3. **One URL policy everywhere.** Links in content and resource links must be `https`, with no credentials and no localhost, private, IP-literal or dotless hosts. The same `unsafeUrlReason` runs in the contracts schemas, the API and again in the renderer. A database CHECK constraint keeps resource links on `https`.
4. **Publish validation lives in one function** (`findPublishIssues`). The editor shows its result live, submit-for-review and publish both run it, and a failed publish returns 422 `PUBLISH_VALIDATION_FAILED` with every issue.
5. **Ownership is checked in the service, roles in the guard.** Routes allow `CONTENT_EDITOR` and `ADMIN`; the service then requires editors to own the course and answers 404 for courses they can't see. Only administrators publish, archive, set the featured rank, change the owner or manage categories.
6. **Search uses Postgres full-text search** on the published snapshot: a `search_vector` column filled by a trigger, a GIN index, `websearch_to_tsquery`, and `ILIKE` on the title for partial words. No separate search service until the catalogue is large enough to need one.

## Consequences

- The snapshot JSON format is versioned (`snapshotSchemaVersion`). Changing it needs a migration for old versions or a reader that understands both.
- Publishing copies the whole course. That is fine for courses of tens of lessons; very large courses would need per-lesson versioning.
- Adding a block type means changing the contracts schema, the editor and the renderer together. Unknown block types fail validation rather than render.
