# Course content

How courses are stored, edited, published and shown. Decisions are in ADR-004.

## Data model

| Table              | What it holds                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `categories`       | The three learning domains (language, communication, leadership). Seeded by `pnpm db:seed`.           |
| `courses`          | The working copy of a course: metadata, status, owner, `draft_revision`, `published_version_id`.      |
| `modules`          | Ordered groups of lessons (`position`, ties broken by id).                                            |
| `lessons`          | Type, minutes, completion rule, objectives and `content` (structured blocks, JSON).                   |
| `lesson_resources` | Video, audio, captions, transcripts, documents and links. Links only for now (`external_url`, https). |
| `course_versions`  | One immutable JSON snapshot per publish, with `search_vector` for the catalogue.                      |

## Status flow

```
DRAFT ──submit (editor)──▶ REVIEW ──publish (admin)──▶ PUBLISHED ──archive (admin)──▶ ARCHIVED
  ▲                           │                             │                           │
  └──────return to draft──────┘        edits keep the live version until the next publish
                                                                     publish again ◀────┘
```

- Administrators can publish straight from DRAFT.
- Publishing a course with no unpublished changes returns 409.
- The slug is locked after the first publish so links keep working.
- Only courses that were never published can be deleted; published ones are archived.

## Publish validation

A course needs a summary, description, at least one outcome, an estimated time, an active category and at least one module. Every module needs a lesson. Every lesson needs minutes and the material its type requires:

| Lesson type       | Needs                                          |
| ----------------- | ---------------------------------------------- |
| Reading, exercise | At least one content block                     |
| Video             | A video resource plus captions or a transcript |
| Audio             | An audio resource plus a transcript            |
| External resource | A link resource                                |

"Finishing the media" as a completion rule is only allowed for video and audio lessons.

## Where things live

- Schemas and rich-text parsing: `packages/contracts/src/catalog.ts`, `packages/contracts/src/content.ts`
- Authoring and publishing: `apps/api/src/courses/course-authoring.service.ts`
- Snapshot building and publish checks: `apps/api/src/courses/course-tree.ts`
- Public catalogue: `apps/api/src/courses/catalog.service.ts`
- Learner pages: `apps/web/src/app/(catalog)/courses/`
- Course studio: `apps/web/src/app/(app)/studio/`, `apps/web/src/components/studio/`
- Lesson renderer: `apps/web/src/components/content/lesson-content.tsx`
- Demo catalogue: `apps/api/src/scripts/demo-courses.ts` (`pnpm --filter @luminai/api seed:demo`)
