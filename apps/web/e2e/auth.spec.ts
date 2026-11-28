import { expect, test } from '@playwright/test';
import { createVerifiedAccount, signIn } from './support/accounts';
import { linkFromEmail, STRONG_PASSWORD, uniqueEmail } from './support/mail';

test('a new learner signs up, verifies, onboards and lands on the dashboard', async ({
  page,
}, testInfo) => {
  const email = uniqueEmail('signup', testInfo.project.name);

  await page.goto('/sign-up');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.getByLabel('Full name').filter({ visible: true }).fill('Amina Rahman');
  await page.getByLabel('Email').filter({ visible: true }).fill(email);
  await page
    .getByLabel('Password', { exact: true })
    .filter({ visible: true })
    .fill(STRONG_PASSWORD);
  await expect(page.getByRole('list', { name: 'Password rules' })).toContainText(
    'At least 12 characters',
  );
  await page.getByRole('button', { name: 'Create account' }).click();

  // Terms must be accepted first.
  await expect(page.getByText('You need to accept the terms to continue.')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/check-email\?email=/);
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend in 0:\d\d/ })).toBeDisabled();

  await page.goto(await linkFromEmail(email, '/verify-email'));
  await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
  // The one-time token is removed from the address bar.
  await expect(page).toHaveURL(/\/verify-email$/);

  await page.getByRole('link', { name: 'Set up my learning' }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fonboarding/);
  await page.getByLabel('Email').filter({ visible: true }).fill(email);
  await page
    .getByLabel('Password', { exact: true })
    .filter({ visible: true })
    .fill(STRONG_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(
    page.getByRole('heading', { name: 'What do you want to get better at?' }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: /Language/ }).check();
  await page.getByRole('checkbox', { name: /Communication/ }).check();
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Where are you starting from?' })).toBeVisible();
  await page
    .getByRole('group', { name: 'Language level' })
    .getByRole('radio', { name: /Intermediate/ })
    .check();
  await page
    .getByRole('group', { name: 'Communication level' })
    .getByRole('radio', { name: /Beginner/ })
    .check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'A few last details' })).toBeVisible();
  await page.getByRole('button', { name: '3–4 times a week' }).click();
  await page.getByRole('button', { name: 'Finish setup' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Welcome, Amina' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your learning goals' })).toContainText(
    'Communication',
  );
});

test('sign-in errors are clear and do not reveal which part was wrong', async ({
  page,
}, testInfo) => {
  const email = uniqueEmail('badlogin', testInfo.project.name);
  await createVerifiedAccount(page.request, email);

  await signIn(page, email, 'not the right password');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/incorrect|invalid/i);

  await signIn(page, uniqueEmail('nobody', testInfo.project.name), 'not the right password');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/incorrect|invalid/i);
});

test('signed-out visitors are sent to sign-in and returned afterwards', async ({
  page,
}, testInfo) => {
  const email = uniqueEmail('redirect', testInfo.project.name);
  await createVerifiedAccount(page.request, email);
  // Mark onboarding done so sign-in honours the requested page.
  await page.goto('/settings/security');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings%2Fsecurity/);

  await page.getByLabel('Email').filter({ visible: true }).fill(email);
  await page
    .getByLabel('Password', { exact: true })
    .filter({ visible: true })
    .fill(STRONG_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // First sign-in goes through onboarding; skipping it continues to the requested page.
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await expect(page).toHaveURL(/\/settings\/security$/);
  await expect(page.getByText('This device')).toBeVisible();
});

test('a learner resets a forgotten password', async ({ page }, testInfo) => {
  const email = uniqueEmail('reset', testInfo.project.name);
  await createVerifiedAccount(page.request, email);

  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').filter({ visible: true }).fill('not-an-email');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Enter a full email address, like name@example.com.')).toBeVisible();

  await page.getByLabel('Email').filter({ visible: true }).fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();

  await page.goto(await linkFromEmail(email, '/reset-password'));
  await expect(page).toHaveURL(/\/reset-password$/);
  const update = page.getByRole('button', { name: 'Update password' });
  await page.getByLabel('New password', { exact: true }).filter({ visible: true }).fill('short');
  await expect(update).toBeDisabled();

  const newPassword = 'a brand new passphrase 42';
  await page
    .getByLabel('New password', { exact: true })
    .filter({ visible: true })
    .fill(newPassword);
  await page.getByLabel('Confirm new password').filter({ visible: true }).fill(newPassword);
  await update.click();
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();

  await signIn(page, email, newPassword);
  await expect(
    page.getByRole('heading', { name: 'What do you want to get better at?' }),
  ).toBeVisible();
});

test('a used reset link shows the expired state', async ({ page }) => {
  await page.goto('/reset-password?token=' + 'x'.repeat(43));
  await page
    .getByLabel('New password', { exact: true })
    .filter({ visible: true })
    .fill('a brand new passphrase 42');
  await page
    .getByLabel('Confirm new password')
    .filter({ visible: true })
    .fill('a brand new passphrase 42');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('heading', { name: 'This reset link has expired' })).toBeVisible();
});

test('an invalid verification link offers a new one without revealing accounts', async ({
  page,
}, testInfo) => {
  await page.goto('/verify-email?token=' + 'y'.repeat(43));
  await expect(page.getByRole('heading', { name: 'We couldn’t verify this link' })).toBeVisible();
  const email = uniqueEmail('ghost', testInfo.project.name);
  await page.getByLabel('Email').filter({ visible: true }).fill(email);
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByText(`If ${email} has an account waiting`)).toBeVisible();
});

test('settings: update the profile, manage sessions and sign out', async ({
  page,
  browser,
}, testInfo) => {
  const email = uniqueEmail('settings', testInfo.project.name);
  await createVerifiedAccount(page.request, email);

  // A second device, so there is another session to sign out.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, email);
  await expect(otherPage).toHaveURL(/\/onboarding/);

  await signIn(page, email);
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await page.getByLabel('Display name').filter({ visible: true }).fill('Amina R.');
  await page.getByRole('button', { name: 'Leadership' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Your changes are saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Display name').filter({ visible: true })).toHaveValue('Amina R.');
  await expect(page.getByRole('button', { name: 'Leadership' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('link', { name: 'Security' }).click();
  await expect(page.getByText('2 active sessions')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out everywhere else' }).click();
  await expect(page.getByText('1 active session')).toBeVisible();

  // The other device is now signed out.
  await otherPage.goto('/settings');
  await expect(otherPage).toHaveURL(/\/sign-in/);
  await other.close();

  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText(/been signed out/)).toBeVisible();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/sign-in/);
});

test('auth pages have no horizontal overflow', async ({ page }) => {
  for (const path of [
    '/sign-up',
    '/sign-in',
    '/forgot-password',
    '/check-email?email=a%40example.test',
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
