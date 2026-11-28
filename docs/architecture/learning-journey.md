# Learning journey

How learners enrol, open lessons and save progress. Decisions are in ADR-005.

## Data model

| Table             | What it holds                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `enrollments`     | One row per learner and course (unique). Status `ACTIVE`, `COMPLETED` or `WITHDRAWN`, the version followed, the resume lesson, times. |
| `lesson_progress` | One row per learner and lesson (unique). `IN_PROGRESS` or `COMPLETED`, percentage (0–100), media position, started/completed times.   |

`lesson_progress.lesson_id` points into the published snapshot, so it has no foreign key to the editable `lessons` table. CHECK constraints keep the percentage in range and tie `completed_at` to the `COMPLETED` status.

## API

| Route                                    | What it does                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `POST /courses/{courseId}/enrollments`   | Enrol (201) or return the existing enrolment (200). Live courses only.                     |
| `GET /courses/{courseIdOrSlug}/learning` | The enrolled course: modules and lessons with states and locks, progress, next lesson.     |
| `GET /lessons/{lessonId}`                | Lesson content, resources, place in the course and the learner's progress.                 |
| `PUT /lessons/{lessonId}/progress`       | `{ positionSeconds?, progressPercent?, completed? }`. Idempotent; returns course progress. |
| `GET /users/me/enrollments`              | The learner's courses with progress, most recent activity first (`?status=`).              |
| `GET /users/me/continue-learning`        | The most recent unfinished course with a lesson to open, or null.                          |

Errors: 403 `NOT_ENROLLED`, 403 `LESSON_LOCKED`, 422 `COMPLETION_RULE_NOT_MET`.

## Rules

- **Required lessons**: a lesson counts towards completion when it and its module are required. A course with no required lessons counts all of them.
- **Locks**: modules open in order; a module is locked while a required module before it has required lessons left. Started lessons stay open.
- **Completion rules**: mark complete (button), view (opening the lesson), finish the media (95% played).
- **Progress percentage** is rounded down, so a course never shows 100% until it is complete.
- **Next lesson**: the last lesson opened if unfinished, otherwise the next open unfinished lesson after it, otherwise the first one in the course.

## Web

- Course page (`/courses/[slug]`): enrol card with three states (Learning.dc.html, 1).
- Lesson player (`/learn/[slug]/[lessonId]`, Lesson.dc.html): outline with states and locks, media with resume, lesson text, completion footer, course-finished card. `/learn/[slug]` opens the lesson to resume.
- Dashboard: continue card and My courses (Dashboard.dc.html). My learning (`/learning`, Learning.dc.html, 2).
- The AI mentor panel in the lesson design arrives with Phase 6.

## Where things live

- Contracts: `packages/contracts/src/learning.ts`
- Rules: `apps/api/src/learning/journey.ts` (unit tests beside it)
- Service and routes: `apps/api/src/learning/`
- Web: `apps/web/src/app/learn/`, `apps/web/src/app/(app)/learning/`, `apps/web/src/components/learning/`
