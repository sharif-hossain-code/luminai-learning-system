import { expect, test } from '@playwright/test';
import { createVerifiedAccount, signIn } from './support/accounts';
import { setRole } from './support/db';
import { uniqueEmail } from './support/mail';

test('learners are kept out of the course studio', async ({ page, request }, testInfo) => {
  const email = uniqueEmail('studio-learner', testInfo.project.name);
  await createVerifiedAccount(request, email);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/(onboarding|dashboard)/);

  await page.goto('/studio');
  await expect(
    page.getByRole('heading', { name: 'The course studio is for content editors' }),
  ).toBeVisible();
});

test('an administrator writes a course, fixes what blocks publishing, and publishes it', async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const email = uniqueEmail('studio-admin', testInfo.project.name);
  await createVerifiedAccount(request, email, 'Rafi Ahmed');
  await setRole(email, 'ADMIN');
  await signIn(page, email);
  await expect(page).toHaveURL(/\/(onboarding|dashboard)/);

  const title = `Giving useful feedback ${testInfo.project.name} ${Date.now().toString(36)}`;
  await page.goto('/studio');
  await page.getByRole('button', { name: 'New course' }).click();
  await page.getByLabel('Working title').fill(title);
  await page.getByLabel('Category').selectOption({ label: 'Communication' });
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  // A fresh draft can't be published yet.
  const publishing = page.getByRole('complementary', { name: 'Publishing and history' });
  await expect(publishing.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  await expect(publishing.getByText('Add a short summary.')).toBeVisible();

  await page.getByLabel('Summary').fill('Give feedback people can act on.');
  await page.getByLabel('Description').fill('Short, specific and kind feedback, step by step.');
  await page.getByLabel('Learning outcomes').fill('Give feedback that changes behaviour');
  await page.getByLabel('hours').fill('1');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByText('Course details saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Add module' }).click();
  await page.getByLabel('New module: title').fill('The basics');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Add lesson' }).click();
  await page.getByLabel('New lesson in The basics: title').fill('Describe what you saw');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // The empty lesson is the last thing blocking publication.
  // The first link is the curriculum row; the publishing panel links to the same lesson.
  await page
    .getByRole('link', { name: /Describe what you saw/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Describe what you saw', level: 1 }),
  ).toBeVisible();
  // Next keeps the previous page mounted but hidden, so match visible controls by role.
  await page.getByRole('spinbutton', { name: 'Minutes', exact: true }).fill('8');
  await page
    .getByRole('group', { name: 'Add a block' })
    .getByRole('button', { name: 'Paragraph' })
    .click();
  await page
    .getByRole('textbox', { name: 'Text', exact: true })
    .fill('Say **what happened**, not what you think it means.');
  await page.getByRole('button', { name: 'Save lesson' }).click();
  await expect(page.getByText('Lesson saved.')).toBeVisible();

  await page.getByRole('link', { name: title }).click();
  await publishing.getByRole('button', { name: 'Publish', exact: true }).click();
  await publishing.getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByText('Published. Learners now see this version.')).toBeVisible();
  await expect(publishing.getByText('Live', { exact: true })).toBeVisible();

  // Learners now find it in the catalogue.
  await page.goto(`/courses?q=${encodeURIComponent('Giving useful feedback')}`);
  await page.getByRole('link', { name: title }).first().click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Describe what you saw')).toBeVisible();
});
