import { expect, test, type Page } from '@playwright/test';
import { createVerifiedAccount, signIn } from './support/accounts';
import { uniqueEmail } from './support/mail';

// Uses the demo course "Negotiation basics": two modules with one reading lesson each.

const visible = (page: Page, text: string) => page.getByText(text).filter({ visible: true });

test('a learner enrols, completes lessons in order, resumes on another device and finishes', async ({
  page,
  browser,
}, testInfo) => {
  const email = uniqueEmail('journey', testInfo.project.name);
  await createVerifiedAccount(page.request, email);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/);

  // Enrol from the course page; the first lesson opens.
  await page.goto('/courses/negotiation-basics');
  await page.getByRole('button', { name: 'Enrol and start' }).click();
  await expect(
    page.getByRole('heading', { name: 'Know your walk-away point', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(/best alternative to a negotiated agreement/)).toBeVisible();
  await expect(page.getByText('Module 1 · Lesson 1 of 1')).toBeVisible();
  const firstLesson = page.url();

  // The second module stays locked until the first is complete.
  if (testInfo.project.name === 'mobile') await visible(page, 'Course outline').click();
  await expect(visible(page, 'Module 2 · Locked')).toBeVisible();

  await page.getByRole('button', { name: 'Mark complete and continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'Positions and interests', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('50% complete')).toBeVisible();

  // Another device (a fresh browser context) picks up where the learner left off.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, email);
  await expect(otherPage).toHaveURL(/\/(dashboard|onboarding)/);
  await otherPage.goto('/dashboard');
  const resume = otherPage.getByRole('region', { name: 'Positions and interests' });
  await expect(resume).toContainText(/continue where you left off/i);
  await resume.getByRole('link', { name: 'Resume lesson' }).click();
  await expect(
    otherPage.getByRole('heading', { name: 'Positions and interests', level: 1 }),
  ).toBeVisible();

  await otherPage.getByRole('button', { name: 'Mark complete' }).click();
  await expect(otherPage.getByRole('heading', { name: 'You finished the course' })).toBeVisible();
  await expect(otherPage.getByText('100% complete')).toBeVisible();
  await other.close();

  // The first device sees the completed course everywhere.
  await page.goto('/courses/negotiation-basics');
  await expect(page.getByText('Course completed')).toBeVisible();
  await page.goto('/learning?status=completed');
  await expect(
    page.getByRole('heading', { name: 'Negotiation basics', exact: true }),
  ).toBeVisible();

  // Completed lessons stay open for review.
  await page.goto(firstLesson);
  await expect(page.getByRole('status').filter({ hasText: 'Completed' })).toBeVisible();
});

test('lessons are for enrolled learners only', async ({ page, browser }, testInfo) => {
  // Find a lesson URL as an enrolled learner.
  const insider = uniqueEmail('insider', testInfo.project.name);
  await createVerifiedAccount(page.request, insider);
  await signIn(page, insider);
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/);
  await page.goto('/courses/leadership-fundamentals');
  await page.getByRole('button', { name: 'Enrol and start' }).click();
  await expect(page).toHaveURL(/\/learn\/leadership-fundamentals\/[0-9a-f-]{36}$/);
  const lessonUrl = new URL(page.url()).pathname;

  // Visitors are sent to sign in; learners who haven't enrolled go to the course page.
  const context = await browser.newContext();
  const outsiderPage = await context.newPage();
  await outsiderPage.goto(lessonUrl);
  await expect(outsiderPage).toHaveURL(/\/sign-in\?next=/);

  const outsider = uniqueEmail('outsider', testInfo.project.name);
  await createVerifiedAccount(outsiderPage.request, outsider);
  await signIn(outsiderPage, outsider);
  await expect(outsiderPage).toHaveURL(/\/learn\/|\/courses\/|\/dashboard|\/onboarding/);
  await outsiderPage.goto(lessonUrl);
  await expect(outsiderPage).toHaveURL(/\/courses\/leadership-fundamentals$/);
  await expect(outsiderPage.getByRole('button', { name: 'Enrol and start' })).toBeVisible();
  await context.close();
});

test('My learning shows a helpful empty state', async ({ page }, testInfo) => {
  const email = uniqueEmail('empty', testInfo.project.name);
  await createVerifiedAccount(page.request, email);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/);
  await page.goto('/learning');
  await expect(page.getByRole('heading', { name: 'My learning', level: 1 })).toBeVisible();
  await expect(page.getByText("You haven't enrolled in a course yet.")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore courses' }).last()).toBeVisible();
});
