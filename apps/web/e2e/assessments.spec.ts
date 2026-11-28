import { expect, test, type APIRequestContext } from '@playwright/test';
import { createVerifiedAccount, signIn } from './support/accounts';
import { setRole } from './support/db';
import { uniqueEmail } from './support/mail';

const CSRF = { 'x-luminai-csrf': '1', origin: 'http://localhost:3100' };

async function api(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  data?: unknown,
) {
  const response = await request.fetch(`/api/v1${path}`, {
    method,
    headers: CSRF,
    ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), `${method} ${path}: ${response.status()}`).toBe(true);
  return ((await response.json()) as { data: unknown }).data;
}

test('an editor adds a quiz in the studio and a learner takes it to finish the course', async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const adminEmail = uniqueEmail('quiz-admin', testInfo.project.name);
  await createVerifiedAccount(page.request, adminEmail, 'Rafi Ahmed');
  await setRole(adminEmail, 'ADMIN');
  await signIn(page, adminEmail);
  await expect(page).toHaveURL(/\/(onboarding|dashboard)/);

  // A one-lesson course, built through the API (the studio's lesson flow has its own test).
  const suffix = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const title = `Opening a talk ${suffix}`;
  const slug = `opening-a-talk-${suffix}`;
  const categories = (await api(page.request, 'GET', '/admin/categories')) as { id: string }[];
  let course = (await api(page.request, 'POST', '/admin/courses', {
    title,
    slug,
    categoryId: categories[0]!.id,
  })) as { id: string; modules: { id: string; lessons: { id: string }[] }[] };
  await api(page.request, 'PATCH', `/admin/courses/${course.id}`, {
    summary: 'Open a talk well.',
    description: 'One lesson and a quiz.',
    estimatedMinutes: 30,
    outcomes: ['Open a talk'],
  });
  course = (await api(page.request, 'POST', `/admin/courses/${course.id}/modules`, {
    title: 'Openings',
  })) as typeof course;
  course = (await api(page.request, 'POST', `/admin/modules/${course.modules[0]!.id}/lessons`, {
    title: 'Earn attention',
    type: 'TEXT',
  })) as typeof course;
  await api(page.request, 'PATCH', `/admin/lessons/${course.modules[0]!.lessons[0]!.id}`, {
    estimatedMinutes: 5,
    content: {
      schemaVersion: 1,
      blocks: [{ type: 'paragraph', content: [{ text: 'Start with a story.' }] }],
    },
  });

  // The quiz is authored in the studio.
  await page.goto(`/studio/courses/${course.id}`);
  await page.getByRole('button', { name: 'Add quiz', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Module 1 quiz', level: 1 })).toBeVisible();
  await expect(page.getByText('Add at least one question.', { exact: true })).toBeVisible();

  const questions = page.getByRole('region', { name: 'Questions' });
  await questions.getByRole('button', { name: 'Add question' }).click();
  const first = page.getByRole('form', { name: 'Edit question 1' });
  await first.getByLabel('Question', { exact: true }).fill('Which opening earns attention?');
  await first.getByLabel('Option 1', { exact: true }).fill('A short story');
  await first.getByLabel('Option 2', { exact: true }).fill('An apology for being nervous');
  await first.getByLabel('Option 1 is correct').check();
  await first.getByRole('button', { name: 'Save question' }).click();
  await expect(page.getByText('Question saved.')).toBeVisible();

  await questions.getByLabel('New question type').selectOption({ label: 'Short answer' });
  await questions.getByRole('button', { name: 'Add question' }).click();
  const second = page.getByRole('form', { name: 'Edit question 2' });
  await second
    .getByLabel('Question', { exact: true })
    .fill('Name the pattern of listing three ideas.');
  await second.getByLabel('Accepted answers').fill('rule of three\ntricolon');
  await second.getByRole('button', { name: 'Save question' }).click();
  await expect(questions.getByText('Short answer · 1 pt')).toBeVisible();

  await questions.getByLabel('New question type').selectOption({ label: 'Writing' });
  await questions.getByRole('button', { name: 'Add question' }).click();
  const third = page.getByRole('form', { name: 'Edit question 3' });
  await third
    .getByLabel('Question', { exact: true })
    .fill('Write the first two sentences of a talk.');
  await third.getByRole('button', { name: 'Add criterion' }).click();
  await third.getByLabel('Criterion 1', { exact: true }).fill('Starts with a story');
  await third.getByRole('button', { name: 'Save question' }).click();
  await expect(questions.getByText('Writing · not scored')).toBeVisible();
  await expect(page.getByText('Before this course can be published')).toHaveCount(0);

  await page.getByRole('link', { name: title }).click();
  const publishing = page.getByRole('complementary', { name: 'Publishing and history' });
  await expect(page.getByRole('link', { name: 'Edit Module 1 quiz' })).toBeVisible();
  await publishing.getByRole('button', { name: 'Publish', exact: true }).click();
  await publishing.getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByText('Published. Learners now see this version.')).toBeVisible();

  // A learner finishes the lesson, then takes the quiz.
  const learnerContext = await browser.newContext();
  const learner = await learnerContext.newPage();
  const learnerEmail = uniqueEmail('quiz-learner', testInfo.project.name);
  await createVerifiedAccount(learner.request, learnerEmail);
  await signIn(learner, learnerEmail);
  await expect(learner).toHaveURL(/\/(dashboard|onboarding)/);
  await learner.goto(`/courses/${slug}`);
  await learner.getByRole('button', { name: 'Enrol and start' }).click();
  await expect(learner.getByRole('heading', { name: 'Earn attention', level: 1 })).toBeVisible();
  await learner.getByRole('button', { name: 'Mark complete and continue' }).click();

  await expect(learner.getByRole('heading', { name: 'Module 1 quiz', level: 1 })).toBeVisible();
  await learner.getByRole('button', { name: 'Start the quiz' }).click();
  await expect(learner.getByText('Question 1 of 3', { exact: false })).toBeVisible();
  // Answer keys never reach the page before submitting.
  await expect(learner.locator('body')).not.toContainText('tricolon');

  await learner.getByRole('radio', { name: 'A short story' }).check();
  await learner
    .getByRole('group', { name: /Question 2 of 3/ })
    .getByLabel('Your answer')
    .fill('Rule of three.');
  await learner
    .getByRole('group', { name: /Question 3 of 3/ })
    .getByLabel('Your answer')
    .fill('Last year I froze on stage. Here is the story of how I learned to start.');
  await learner.getByRole('button', { name: 'Submit answers' }).click();

  await expect(learner.getByRole('heading', { name: 'Well done, you passed' })).toBeVisible();
  await expect(learner.getByText('2 of 2 points · 100%', { exact: false })).toBeVisible();
  await expect(learner.getByText('AI feedback · not scored')).toBeVisible();
  await expect(learner.getByText('You finished the course.')).toBeVisible();
  await learnerContext.close();
});
