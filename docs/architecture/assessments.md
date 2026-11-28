# Assessments

Quizzes authored in the studio and taken by enrolled learners. Decisions are in [ADR-006](../adr/ADR-006-assessments.md); the journey rules are in [learning-journey.md](learning-journey.md). Designs: `designs/luminai-canvas/project/Assessment.dc.html`.

## Model

| Table                 | Purpose                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `assessments`         | Working copy: course, module (null for a final assessment), title, instructions, required, pass mark, attempts, feedback mode, minutes |
| `questions`           | Type, prompt, options, `answer_key`, explanation, rubric, points, position                                                             |
| `assessment_attempts` | Learner, enrolment, pinned `course_version_id`, attempt number, status, score, percent, passed                                         |
| `attempt_answers`     | One row per question: response, awarded points, correct, AI feedback                                                                   |

Question types: single choice, multiple select, true or false, short answer (scored) and writing (AI feedback only, not scored).

## API

| Route                                                            | Who                  | Notes                                                                                                        |
| ---------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET /assessments/{id}`                                          | Enrolled learner     | Start page: facts, best result, attempts left, open attempt, previous and next step. 403 `ASSESSMENT_LOCKED` |
| `POST /assessments/{id}/attempts`                                | Enrolled learner     | 201 new attempt, 200 the open one; 409 `ATTEMPT_LIMIT_REACHED`                                               |
| `GET /attempts/{id}`                                             | The attempt's owner  | Questions from the pinned version; result once submitted. Anyone else gets 404                               |
| `PUT /attempts/{id}/answers/{questionId}`                        | Owner                | Autosave. 409 `ATTEMPT_SUBMITTED`, 422 for a response that doesn't fit the question                          |
| `POST /attempts/{id}/submit`                                     | Owner                | Optional final answers; scores, then adds writing feedback                                                   |
| `GET /users/me/up-next`                                          | Learner              | Open required quizzes across active courses (at most 3)                                                      |
| `POST /admin/courses/{id}/assessments`                           | Editor of the course | Add a quiz to a module or the course                                                                         |
| `PATCH`/`DELETE /admin/assessments/{id}`                         | Editor               | Settings, move between modules                                                                               |
| `POST /admin/assessments/{id}/questions`, `PUT …/question-order` | Editor               | Add (by type) and reorder questions                                                                          |
| `PATCH`/`DELETE /admin/questions/{id}`                           | Editor               | The server keeps options, key, points and rubric consistent with the type                                    |

## Web

- `/learn/[slug]/quiz/[assessmentId]`: start page (attempts, pass mark, resume or start).
- `/learn/[slug]/quiz/[assessmentId]/attempts/[attemptId]`: every question on one page; choices save at once, typed answers after a short pause and on blur; submit asks about unanswered questions. After submitting, the same URL shows the result and review.
- Outline: quizzes after a module's lessons, and a "Final assessment" group.
- Dashboard: "Up next" card (hidden when empty).
- Studio: quiz rows and "Add quiz" in each module, a "Final assessment" box, and the quiz editor at `/studio/courses/[courseId]/assessments/[assessmentId]`.

## Feedback modes

| Mode          | After submitting                                                                     |
| ------------- | ------------------------------------------------------------------------------------ |
| `SCORE_ONLY`  | Score and pass or fail                                                               |
| `CORRECTNESS` | Plus which answers were right                                                        |
| `FULL`        | Plus correct answers and explanations, once the learner passed or is out of attempts |

Writing feedback is shown in every mode, marked "AI feedback · not scored".
