import { randomInt } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, startTestApp, STRONG_PASSWORD, uniqueEmail, type TestApp } from './helpers.js';

let t: TestApp;
// Per-run client address, so IP buckets left in Redis by earlier runs never interfere.
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

beforeAll(async () => {
  t = await startTestApp({ RATE_LIMIT_ENABLED: 'true' });
});

afterAll(async () => {
  await t?.close();
});

describe('rate limiting', () => {
  it('limits sign-in attempts per email', async () => {
    const email = uniqueEmail('ratelogin');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await call(t.app, 'POST', '/auth/login', {
        remoteAddress: ip,
        body: { email, password: 'wrong password!' },
      });
      statuses.push(response.statusCode);
      if (response.statusCode === 429) {
        expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      }
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('allows one verification resend per minute per email', async () => {
    const email = uniqueEmail('rateresend');
    await call(t.app, 'POST', '/auth/register', {
      remoteAddress: ip,
      body: { email, password: STRONG_PASSWORD, acceptTerms: true },
    });
    expect(
      (
        await call(t.app, 'POST', '/auth/resend-verification', {
          remoteAddress: ip,
          body: { email },
        })
      ).statusCode,
    ).toBe(202);
    expect(
      (
        await call(t.app, 'POST', '/auth/resend-verification', {
          remoteAddress: ip,
          body: { email },
        })
      ).statusCode,
    ).toBe(429);
  });

  it('limits password reset requests per email', async () => {
    const email = uniqueEmail('rateforgot');
    expect(
      (await call(t.app, 'POST', '/auth/forgot-password', { remoteAddress: ip, body: { email } }))
        .statusCode,
    ).toBe(202);
    expect(
      (await call(t.app, 'POST', '/auth/forgot-password', { remoteAddress: ip, body: { email } }))
        .statusCode,
    ).toBe(429);
  });

  it('counts the same email in different letter case as one bucket', async () => {
    const email = uniqueEmail('ratecase');
    expect(
      (await call(t.app, 'POST', '/auth/forgot-password', { remoteAddress: ip, body: { email } }))
        .statusCode,
    ).toBe(202);
    const shouted = await call(t.app, 'POST', '/auth/forgot-password', {
      remoteAddress: ip,
      body: { email: email.toUpperCase() },
    });
    expect(shouted.statusCode).toBe(429);
  });
});
