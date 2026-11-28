import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { linkFromEmail, STRONG_PASSWORD } from './mail';

const CSRF = { 'x-luminai-csrf': '1', origin: 'http://localhost:3100' };

/** Creates and verifies an account through the API, skipping the UI. */
export async function createVerifiedAccount(
  request: APIRequestContext,
  email: string,
  displayName = 'Amina Rahman',
) {
  const register = await request.post('/api/v1/auth/register', {
    headers: CSRF,
    data: { email, password: STRONG_PASSWORD, displayName, acceptTerms: true },
  });
  expect(register.status()).toBe(202);
  const link = await linkFromEmail(email, '/verify-email');
  const token = new URL(link, 'http://x').searchParams.get('token');
  const verify = await request.post('/api/v1/auth/verify-email', {
    headers: CSRF,
    data: { token },
  });
  expect(verify.status()).toBe(204);
}

export async function signIn(page: Page, email: string, password = STRONG_PASSWORD) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').filter({ visible: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).filter({ visible: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
