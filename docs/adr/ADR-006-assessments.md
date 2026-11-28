# ADR-006: Assessments live in the course snapshot; attempts are pinned and scored on the server

- Status: Accepted
- Date: 2026-11-28

## Context

Phase 5 adds quizzes: authored in the course studio, published with the course, taken by enrolled learners, scored, and counted towards course completion. Answer keys must never reach learners before review, attempts must belong to one learner, a submitted attempt must not change, and writing tasks get AI feedback that is clearly marked and bounded by a rubric.

## Decisions

1. **Assessments are part of the course.** `assessments` and `questions` are working-copy tables like modules and lessons (ADR-004). An assessment ends a module (`module_id`) or sits at the course level as a final assessment (`module_id` null). Publishing copies them, answer keys included, into the snapshot (schema version 2; version 1 snapshots read as having no assessments). Publish checks list quiz problems with the path `assessment:<id>`.
2. **Answer keys stay on the server.** Learner shapes (`learnerAssessmentSchema`, `attemptSchema`, outline entries, up next) are built field by field and never include `answerKey` or explanations before review. Integration tests scan every learner response for key material.
3. **Attempts are pinned to the version they started on.** `assessment_attempts.course_version_id` fixes the questions and the key used for scoring, so a republish mid-attempt changes nothing for that attempt. Learners still follow the live version for the next attempt (ADR-005).
4. **One open attempt per learner and quiz**, enforced by a partial unique index (`status = 'IN_PROGRESS'`). Starting returns the open attempt (200) instead of opening a second; concurrent starts read the winner. `max_attempts` (null for unlimited) is checked inside the same transaction (409 `ATTEMPT_LIMIT_REACHED`).
5. **Saves and submit lock the attempt row** (`SELECT … FOR UPDATE`). Answers save one at a time (`PUT /attempts/{id}/answers/{questionId}`); submit writes any final answers, scores and marks the attempt `SUBMITTED` in one transaction. Anything after that gets 409 `ATTEMPT_SUBMITTED`, so two submits score once.
6. **Scoring is a pure function** (`apps/api/src/assessments/grading.ts`): all-or-nothing per question, short answers compared after normalising case, spacing and end punctuation, percent rounded down, `passed = percent ≥ pass mark`. Writing questions are not scored.
7. **Writing feedback is AI, bounded by the rubric.** After the scoring transaction commits, a `WritingFeedbackProvider` rates each rubric criterion (`MET`, `PARTLY`, `NOT_YET`) with a short comment. `boundFeedback` keeps only the question's criteria, in rubric order, clips text and drops anything else the model returns. Every result says `generatedBy: 'AI'` and carries a fixed notice. If the provider fails or times out (15 s), the answer shows "feedback unavailable"; the score is unaffected. Until an AI provider is chosen (A6) a built-in mock checker is used and the page says so.
8. **What learners see after submitting** is set per quiz: the score only, which answers were right, or answers and explanations. With answers and explanations, the correct answers appear only once the learner has passed or used every attempt, so retries stay meaningful.
9. **Quizzes join the journey** (`buildJourney`): steps are a module's lessons then its quizzes, then final assessments. A required quiz must be passed for its module to count as complete, so it gates later modules and course completion. Final assessments open once everything else required is done. Course completion is recomputed when an attempt is submitted.

## Consequences

- Scoring and reveal rules are server-only and covered by unit and integration tests; the web app only renders what it is sent.
- Feedback generation runs inside the submit request for now. When a real provider is added it may move to the worker, with the result view polling.
- No partial credit, no question banks or randomisation, no timers or due dates. These can be added without changing the attempt model.
