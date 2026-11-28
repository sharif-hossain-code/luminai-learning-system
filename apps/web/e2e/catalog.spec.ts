import { expect, test } from '@playwright/test';

// The API web server loads the demo catalogue (apps/api/src/scripts/demo-courses.ts).
// Other suites may add courses with similar titles, so headings are matched exactly.

test('anyone can browse, search and filter the catalogue', async ({ page }) => {
  await page.goto('/courses');
  await expect(page.getByRole('heading', { name: 'Explore courses', level: 1 })).toBeVisible();
  // The top featured course gets the large card.
  await expect(page.getByRole('region', { name: 'Public speaking essentials' })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search courses' }).fill('negotiat');
  await expect(page).toHaveURL(/[?&]q=negotiat/);
  await expect(
    page.getByRole('heading', { name: 'Negotiation basics', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Leadership fundamentals', exact: true }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear search' }).click();
  await page
    .getByRole('group', { name: 'Category' })
    .getByRole('button', { name: 'Leadership' })
    .click();
  await expect(page).toHaveURL(/category=leadership/);
  await expect(
    page.getByRole('heading', { name: 'Leadership fundamentals', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Resolving team conflict', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Negotiation basics', exact: true })).toHaveCount(
    0,
  );

  await page.getByLabel('Level').selectOption('ADVANCED');
  await expect(page).toHaveURL(/level=ADVANCED/);
  await expect(
    page.getByRole('heading', { name: 'Leadership fundamentals', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Resolving team conflict', exact: true }),
  ).toBeVisible();

  await page.goto('/courses?q=zzzz-no-such-course');
  await expect(page.getByRole('heading', { name: 'No courses match' })).toBeVisible();
});

test('the course page shows the outline but never lesson content', async ({ page }) => {
  await page.goto('/courses/professional-english-writing');
  await expect(
    page.getByRole('heading', { name: 'Professional English writing', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Write emails with a clear ask')).toBeVisible();
  await expect(page.getByText('Emails that get answers')).toBeVisible();
  await expect(page.getByText('Put the ask first')).toBeVisible();
  // Lesson text is for enrolled learners only.
  await expect(page.getByText('Busy readers decide in the first line')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sign up to start' })).toBeVisible();

  // The page streams, so the status is already sent; Next marks it noindex instead.
  await page.goto('/courses/no-such-course');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
});
