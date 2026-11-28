# ADR-005: Enrolment and progress follow the live version, keyed by lesson id

- Status: Accepted
- Date: 2026-11-28

## Context

Phase 4 lets learners enrol, open lessons and save progress. Courses keep changing after learners start them (ADR-004), progress writes arrive from several tabs and devices and are retried by flaky networks, and every lesson read has to be authorised on the server.

## Decisions

1. **One enrolment per learner and course.** `enrollments` has a unique `(user_id, course_id)` constraint. `POST /courses/{id}/enrollments` is idempotent: 201 when it creates the enrolment, 200 with the same enrolment afterwards (also for concurrent requests, which hit the constraint and read the winner). A `WITHDRAWN` enrolment is reactivated instead of duplicated.
2. **Learners follow the live version.** The enrolment records the version the learner is on and moves to the newly published version the next time they open the course. Progress rows are keyed by lesson id, which stays the same across versions, so finished lessons stay finished after a republish. If a course is archived, enrolled learners keep the version they were following; nobody new can enrol.
3. **Progress writes are atomic upserts that never go backwards.** `PUT /lessons/{id}/progress` runs a single `INSERT … ON CONFLICT (user_id, lesson_id) DO UPDATE` that keeps the highest percentage, the latest position, `COMPLETED` once reached and the first completion time. Retries and out-of-order writes give the same result.
4. **Completion follows the lesson's rule on the server.** "Mark complete" needs `completed: true`; "View" completes on the first progress write (the player sends one when the lesson opens); "Finish the media" needs 95% played and refuses `completed: true` before that (422 `COMPLETION_RULE_NOT_MET`). Course completion is computed from required lessons in required modules and recorded once (`ACTIVE → COMPLETED`). Assessments will join the rule in Phase 5.
5. **Modules open in order** (from the lesson player design): a module is locked while a required module before it has required lessons left. Lessons the learner already started stay open. Locked lessons return 403 `LESSON_LOCKED`.
6. **The rules are one pure function** (`buildJourney` in `apps/api/src/learning/journey.ts`): lesson and module states, locks, course progress and the lesson to resume. The API computes it on read from the snapshot and the learner's progress rows; nothing derived is stored.
7. **Lesson lookup uses the snapshot.** `GET /lessons/{id}` finds the learner's enrolment whose current version contains the lesson with a `jsonb @>` query, so access never depends on the editable working copy. Not enrolled in a live course gives 403 `NOT_ENROLLED`; anything else gives 404.

## Consequences

- Derived numbers (percent, next lesson) are computed per request. That is cheap for courses of tens of lessons and a few dozen enrolments per learner; dashboards for thousands would want a stored projection.
- A republish that adds a required lesson to an earlier module can lock lessons the learner hasn't started yet in later modules, and reopens a "completed" module. Course completion already recorded stays recorded.
- Media completion trusts the player's reported percentage. That is acceptable for learning progress; it is not a proof of viewing.
