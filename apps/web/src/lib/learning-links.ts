/** Where lessons and quizzes live in the web app (usable from client and server code). */
export const lessonHref = (slug: string, lessonId: string) => `/learn/${slug}/${lessonId}`;

export const assessmentHref = (slug: string, assessmentId: string) =>
  `/learn/${slug}/quiz/${assessmentId}`;

export const attemptHref = (slug: string, assessmentId: string, attemptId: string) =>
  `/learn/${slug}/quiz/${assessmentId}/attempts/${attemptId}`;

/** A step in course order: a lesson or a quiz. */
export const stepHref = (slug: string, step: { kind: 'LESSON' | 'ASSESSMENT'; id: string }) =>
  step.kind === 'LESSON' ? lessonHref(slug, step.id) : assessmentHref(slug, step.id);
