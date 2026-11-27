import { currentUserSchema, errorEnvelopeSchema } from '@luminai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  call,
  makeAdmin,
  sessionCookieFrom,
  signedInLearner,
  startTestApp,
  STRONG_PASSWORD,
  tokenFromEmail,
  uniqueEmail,
  type TestApp,
} from './helpers.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});

afterAll(async () => {
  await t?.close();
});

const errorCode = (response: { json: () => unknown }) =>
  errorEnvelopeSchema.parse(response.json()).error.code;

describe('registration and email verification', () => {
  it('registers, blocks sign-in until verified, then verifies once', async () => {
    const email = uniqueEmail('reg');
    const register = await call(t.app, 'POST', '/auth/register', {
      body: { email: `  ${email.toUpperCase()} `, password: STRONG_PASSWORD, acceptTerms: true },
    });
    expect(register.statusCode).toBe(202);
    expect(register.json()).toEqual({ data: { status: 'accepted' } });

    const stored = await t.db.user.findUniqueOrThrow({ where: { email } });
    expect(stored.status).toBe('PENDING_VERIFICATION');
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.termsAcceptedAt).not.toBeNull();

    const early = await call(t.app, 'POST', '/auth/login', {
      body: { email, password: STRONG_PASSWORD },
    });
    expect(early.statusCode).toBe(403);
    expect(errorCode(early)).toBe('EMAIL_NOT_VERIFIED');

    const token = tokenFromEmail(t.outbox, email, '/verify-email');
    expect((await call(t.app, 'POST', '/auth/verify-email', { body: { token } })).statusCode).toBe(
      204,
    );

    const reused = await call(t.app, 'POST', '/auth/verify-email', { body: { token } });
    expect(reused.statusCode).toBe(400);
    expect(errorCode(reused)).toBe('TOKEN_INVALID');

    const login = await call(t.app, 'POST', '/auth/login', {
      body: { email, password: STRONG_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
  });

  it('rejects an expired verification link', async () => {
    const email = uniqueEmail('expired');
    await call(t.app, 'POST', '/auth/register', {
      body: { email, password: STRONG_PASSWORD, acceptTerms: true },
    });
    const token = tokenFromEmail(t.outbox, email, '/verify-email');
    await t.db.emailVerificationToken.updateMany({
      where: { user: { email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const response = await call(t.app, 'POST', '/auth/verify-email', { body: { token } });
    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('TOKEN_INVALID');
  });

  it('invalidates the old link when a new one is sent', async () => {
    const email = uniqueEmail('resend');
    await call(t.app, 'POST', '/auth/register', {
      body: { email, password: STRONG_PASSWORD, acceptTerms: true },
    });
    const first = tokenFromEmail(t.outbox, email, '/verify-email');
    expect(
      (await call(t.app, 'POST', '/auth/resend-verification', { body: { email } })).statusCode,
    ).toBe(202);
    const second = tokenFromEmail(t.outbox, email, '/verify-email');
    expect(second).not.toBe(first);
    expect(
      (await call(t.app, 'POST', '/auth/verify-email', { body: { token: first } })).statusCode,
    ).toBe(400);
    expect(
      (await call(t.app, 'POST', '/auth/verify-email', { body: { token: second } })).statusCode,
    ).toBe(204);
  });

  it('answers a duplicate registration exactly like a new one and emails the owner', async () => {
    const { email } = await signedInLearner(t, 'dup');
    const before = t.outbox.outbox.length;
    const response = await call(t.app, 'POST', '/auth/register', {
      body: { email, password: 'another strong password', acceptTerms: true },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ data: { status: 'accepted' } });
    expect(await t.db.user.count({ where: { email } })).toBe(1);
    expect(t.outbox.outbox.length).toBe(before + 1);
    expect(t.outbox.lastTo(email)?.subject).toBe('You already have a Luminai account');
  });

  it('gives the same answer to resend requests for unknown emails, without sending anything', async () => {
    const before = t.outbox.outbox.length;
    const response = await call(t.app, 'POST', '/auth/resend-verification', {
      body: { email: uniqueEmail('ghost') },
    });
    expect(response.statusCode).toBe(202);
    expect(t.outbox.outbox.length).toBe(before);
  });

  it.each([
    ['a short password', { password: 'short', acceptTerms: true }, 'password'],
    ['a common password', { password: 'password1234', acceptTerms: true }, 'password'],
    ['terms not accepted', { password: STRONG_PASSWORD, acceptTerms: false }, 'acceptTerms'],
    [
      'an invalid email',
      { email: 'not-an-email', password: STRONG_PASSWORD, acceptTerms: true },
      'email',
    ],
  ])('rejects %s with a field error', async (_case, body, field) => {
    const response = await call(t.app, 'POST', '/auth/register', {
      body: { email: uniqueEmail('bad'), ...body },
    });
    expect(response.statusCode).toBe(422);
    const envelope = errorEnvelopeSchema.parse(response.json());
    expect(envelope.error.fieldErrors.map((error) => error.field)).toContain(field);
  });

  it('rejects a password containing the email name', async () => {
    const email = uniqueEmail('sharifexample');
    const response = await call(t.app, 'POST', '/auth/register', {
      body: { email, password: `${email.split('@')[0]}-secret`, acceptTerms: true },
    });
    expect(response.statusCode).toBe(422);
    expect(errorCode(response)).toBe('WEAK_PASSWORD');
  });
});

describe('sign-in and sessions', () => {
  it('sets a secure, HttpOnly session cookie and returns the user without secrets', async () => {
    const { email } = await signedInLearner(t, 'cookie');
    const login = await call(t.app, 'POST', '/auth/login', {
      body: { email, password: STRONG_PASSWORD },
    });
    const setCookie = String(login.headers['set-cookie']);
    expect(setCookie).toMatch(/^luminai_session=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(login.body).not.toContain('passwordHash');
    expect(login.body).not.toContain('argon2');
    currentUserSchema.parse(login.json<{ data: unknown }>().data);

    // Only the hash of the token is stored.
    const token = sessionCookieFrom(login).split('=')[1]!;
    expect(await t.db.session.count({ where: { tokenHash: token } })).toBe(0);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const { email } = await signedInLearner(t, 'wrongpw');
    const wrong = await call(t.app, 'POST', '/auth/login', {
      body: { email, password: 'not the right password' },
    });
    const unknown = await call(t.app, 'POST', '/auth/login', {
      body: { email: uniqueEmail('nobody'), password: STRONG_PASSWORD },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(errorEnvelopeSchema.parse(wrong.json()).error.message).toBe(
      errorEnvelopeSchema.parse(unknown.json()).error.message,
    );
  });

  it('records failed sign-ins in the audit log without the email address', async () => {
    const { email, userId } = await signedInLearner(t, 'audit');
    await call(t.app, 'POST', '/auth/login', { body: { email, password: 'definitely wrong' } });
    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'auth.login_failed', resourceId: userId },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(event.metadata)).not.toContain(email);
    expect(event.ipHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('rejects requests without a session', async () => {
    const response = await call(t.app, 'GET', '/users/me');
    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHENTICATED');
  });

  it('rejects a forged session cookie', async () => {
    const response = await call(t.app, 'GET', '/users/me', {
      cookie: `luminai_session=${'a'.repeat(43)}`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('logout revokes the session and clears the cookie', async () => {
    const { cookie } = await signedInLearner(t, 'logout');
    const logout = await call(t.app, 'POST', '/auth/logout', { cookie });
    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers['set-cookie'])).toMatch(/luminai_session=;/);
    expect((await call(t.app, 'GET', '/users/me', { cookie })).statusCode).toBe(401);
  });

  it('logout-all revokes every session', async () => {
    const { email, cookie } = await signedInLearner(t, 'logoutall');
    const second = sessionCookieFrom(
      await call(t.app, 'POST', '/auth/login', { body: { email, password: STRONG_PASSWORD } }),
    );
    expect((await call(t.app, 'POST', '/auth/logout-all', { cookie })).statusCode).toBe(204);
    expect((await call(t.app, 'GET', '/users/me', { cookie })).statusCode).toBe(401);
    expect((await call(t.app, 'GET', '/users/me', { cookie: second })).statusCode).toBe(401);
  });

  it("lists my sessions and lets me revoke one, but not someone else's", async () => {
    const a = await signedInLearner(t, 'sessa');
    const b = await signedInLearner(t, 'sessb');
    const other = sessionCookieFrom(
      await call(t.app, 'POST', '/auth/login', {
        body: { email: a.email, password: STRONG_PASSWORD },
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/150.0 Safari/537.36' },
      }),
    );

    const list = await call(t.app, 'GET', '/auth/sessions', { cookie: a.cookie });
    const sessions = list.json<{ data: { id: string; device: string; current: boolean }[] }>().data;
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.current)).toHaveLength(1);
    expect(sessions.map((session) => session.device)).toContain('Chrome on Windows');
    const otherSession = sessions.find((session) => !session.current)!;

    // User B cannot revoke user A's session: it looks like it doesn't exist.
    const forbidden = await call(t.app, 'DELETE', `/auth/sessions/${otherSession.id}`, {
      cookie: b.cookie,
    });
    expect(forbidden.statusCode).toBe(404);
    expect((await call(t.app, 'GET', '/users/me', { cookie: other })).statusCode).toBe(200);

    expect(
      (await call(t.app, 'DELETE', `/auth/sessions/${otherSession.id}`, { cookie: a.cookie }))
        .statusCode,
    ).toBe(204);
    expect((await call(t.app, 'GET', '/users/me', { cookie: other })).statusCode).toBe(401);
    expect((await call(t.app, 'GET', '/users/me', { cookie: a.cookie })).statusCode).toBe(200);
  });

  it('rejects an expired session', async () => {
    const { cookie, userId } = await signedInLearner(t, 'expiredsession');
    await t.db.session.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await call(t.app, 'GET', '/users/me', { cookie })).statusCode).toBe(401);
  });
});

describe('password reset and change', () => {
  it('resets the password with a single-use link and signs out every session', async () => {
    const { email, cookie } = await signedInLearner(t, 'reset');
    expect(
      (await call(t.app, 'POST', '/auth/forgot-password', { body: { email } })).statusCode,
    ).toBe(202);
    const token = tokenFromEmail(t.outbox, email, '/reset-password');

    const newPassword = 'a brand new passphrase';
    expect(
      (
        await call(t.app, 'POST', '/auth/reset-password', {
          body: { token, password: newPassword },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await call(t.app, 'POST', '/auth/reset-password', {
          body: { token, password: 'yet another passphrase' },
        })
      ).statusCode,
    ).toBe(400);

    expect((await call(t.app, 'GET', '/users/me', { cookie })).statusCode).toBe(401);
    expect(
      (await call(t.app, 'POST', '/auth/login', { body: { email, password: STRONG_PASSWORD } }))
        .statusCode,
    ).toBe(401);
    expect(
      (await call(t.app, 'POST', '/auth/login', { body: { email, password: newPassword } }))
        .statusCode,
    ).toBe(200);
    expect(t.outbox.lastTo(email)?.subject).toBe('Your Luminai password was changed');
  });

  it('answers forgot-password the same for unknown emails and sends nothing', async () => {
    const before = t.outbox.outbox.length;
    const response = await call(t.app, 'POST', '/auth/forgot-password', {
      body: { email: uniqueEmail('unknown') },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ data: { status: 'accepted' } });
    expect(t.outbox.outbox.length).toBe(before);
  });

  it('rejects an expired reset link', async () => {
    const { email } = await signedInLearner(t, 'resetexpired');
    await call(t.app, 'POST', '/auth/forgot-password', { body: { email } });
    const token = tokenFromEmail(t.outbox, email, '/reset-password');
    await t.db.passwordResetToken.updateMany({
      where: { user: { email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const response = await call(t.app, 'POST', '/auth/reset-password', {
      body: { token, password: 'a brand new passphrase' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('changes the password, rotates this session and signs out the others', async () => {
    const { email, cookie } = await signedInLearner(t, 'change');
    const other = sessionCookieFrom(
      await call(t.app, 'POST', '/auth/login', { body: { email, password: STRONG_PASSWORD } }),
    );

    const wrong = await call(t.app, 'POST', '/auth/change-password', {
      cookie,
      body: { currentPassword: 'wrong password!!', newPassword: 'a different passphrase' },
    });
    expect(wrong.statusCode).toBe(422);

    const changed = await call(t.app, 'POST', '/auth/change-password', {
      cookie,
      body: { currentPassword: STRONG_PASSWORD, newPassword: 'a different passphrase' },
    });
    expect(changed.statusCode).toBe(200);
    const rotated = sessionCookieFrom(changed);
    expect(rotated).not.toBe(cookie);

    expect((await call(t.app, 'GET', '/users/me', { cookie })).statusCode).toBe(401);
    expect((await call(t.app, 'GET', '/users/me', { cookie: other })).statusCode).toBe(401);
    expect((await call(t.app, 'GET', '/users/me', { cookie: rotated })).statusCode).toBe(200);
  });
});

describe('profile and preferences', () => {
  it('updates my profile and validates locale and time zone', async () => {
    const { cookie } = await signedInLearner(t, 'profile');
    const updated = await call(t.app, 'PATCH', '/users/me/profile', {
      cookie,
      body: {
        displayName: 'Amina',
        locale: 'en-gb',
        timezone: 'Asia/Dhaka',
        learningGoals: ['language', 'leadership', 'language'],
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      data: {
        profile: {
          displayName: 'Amina',
          locale: 'en-GB',
          timezone: 'Asia/Dhaka',
          learningGoals: ['language', 'leadership'],
        },
      },
    });

    const badZone = await call(t.app, 'PATCH', '/users/me/profile', {
      cookie,
      body: { timezone: 'Mars/Olympus' },
    });
    expect(badZone.statusCode).toBe(422);
    expect(errorEnvelopeSchema.parse(badZone.json()).error.fieldErrors[0]?.field).toBe('timezone');
  });

  it('rejects unknown fields, so a client cannot set its own role or user ID', async () => {
    const { cookie } = await signedInLearner(t, 'strict');
    for (const body of [
      { role: 'ADMIN' },
      { userId: '00000000-0000-4000-8000-000000000000' },
      { email: 'x@example.test' },
    ]) {
      const response = await call(t.app, 'PATCH', '/users/me/profile', { cookie, body });
      expect(response.statusCode).toBe(422);
    }
    const me = await call(t.app, 'GET', '/users/me', { cookie });
    expect(me.json()).toMatchObject({ data: { role: 'LEARNER' } });
  });

  it("merges preferences and keeps each user's preferences separate", async () => {
    const a = await signedInLearner(t, 'prefa');
    const b = await signedInLearner(t, 'prefb');
    await call(t.app, 'PATCH', '/users/me/preferences', {
      cookie: a.cookie,
      body: { levels: { language: 'intermediate' } },
    });
    const merged = await call(t.app, 'PATCH', '/users/me/preferences', {
      cookie: a.cookie,
      body: { practiceFrequency: 'daily', onboardingCompletedAt: '2026-11-27T10:00:00.000Z' },
    });
    expect(merged.json()).toEqual({
      data: {
        levels: { language: 'intermediate' },
        practiceFrequency: 'daily',
        onboardingCompletedAt: '2026-11-27T10:00:00.000Z',
      },
    });
    const other = await call(t.app, 'GET', '/users/me/preferences', { cookie: b.cookie });
    expect(other.json()).toEqual({ data: {} });
  });

  it("only ever returns the caller's own account", async () => {
    const a = await signedInLearner(t, 'owna');
    const b = await signedInLearner(t, 'ownb');
    const meA = await call(t.app, 'GET', '/users/me', { cookie: a.cookie });
    const meB = await call(t.app, 'GET', '/users/me', { cookie: b.cookie });
    expect(meA.json()).toMatchObject({ data: { id: a.userId, email: a.email } });
    expect(meB.json()).toMatchObject({ data: { id: b.userId, email: b.email } });
    // There is no route that takes another user's ID.
    expect((await call(t.app, 'GET', `/users/${b.userId}`, { cookie: a.cookie })).statusCode).toBe(
      404,
    );
  });
});

describe('administration and roles', () => {
  it('stops learners and anonymous callers from using admin routes', async () => {
    const learner = await signedInLearner(t, 'notadmin');
    expect((await call(t.app, 'GET', '/admin/users')).statusCode).toBe(401);
    const response = await call(t.app, 'GET', '/admin/users', { cookie: learner.cookie });
    expect(response.statusCode).toBe(403);
    const patch = await call(t.app, 'PATCH', `/admin/users/${learner.userId}/role`, {
      cookie: learner.cookie,
      body: { role: 'ADMIN' },
    });
    expect(patch.statusCode).toBe(403);
  });

  it('stops content editors from using admin routes', async () => {
    const editor = await signedInLearner(t, 'editor');
    const role = await t.db.role.findUniqueOrThrow({ where: { code: 'CONTENT_EDITOR' } });
    await t.db.user.update({ where: { id: editor.userId }, data: { roleId: role.id } });
    expect((await call(t.app, 'GET', '/admin/users', { cookie: editor.cookie })).statusCode).toBe(
      403,
    );
  });

  it('lets an admin search users and change roles, with an audit event', async () => {
    const admin = await signedInLearner(t, 'admin');
    await makeAdmin(t.db, admin.userId);
    const target = await signedInLearner(t, 'promote');

    const list = await call(t.app, 'GET', `/admin/users?q=${encodeURIComponent(target.email)}`, {
      cookie: admin.cookie,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ data: [{ id: target.userId }], pagination: { total: 1 } });
    expect(list.body).not.toContain('passwordHash');

    const promoted = await call(t.app, 'PATCH', `/admin/users/${target.userId}/role`, {
      cookie: admin.cookie,
      body: { role: 'CONTENT_EDITOR' },
    });
    expect(promoted.statusCode).toBe(200);
    expect(promoted.json()).toMatchObject({ data: { role: 'CONTENT_EDITOR' } });

    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'admin.user_role_changed', resourceId: target.userId },
    });
    expect(event.actorUserId).toBe(admin.userId);
    expect(event.metadata).toEqual({ from: 'LEARNER', to: 'CONTENT_EDITOR' });
  });

  it('does not let an admin change their own role', async () => {
    const admin = await signedInLearner(t, 'selfadmin');
    await makeAdmin(t.db, admin.userId);
    const response = await call(t.app, 'PATCH', `/admin/users/${admin.userId}/role`, {
      cookie: admin.cookie,
      body: { role: 'LEARNER' },
    });
    expect(response.statusCode).toBe(409);
  });

  it('suspending a user signs them out and blocks sign-in', async () => {
    const admin = await signedInLearner(t, 'suspender');
    await makeAdmin(t.db, admin.userId);
    const target = await signedInLearner(t, 'suspended');

    const response = await call(t.app, 'PATCH', `/admin/users/${target.userId}/status`, {
      cookie: admin.cookie,
      body: { status: 'SUSPENDED' },
    });
    expect(response.statusCode).toBe(200);
    expect((await call(t.app, 'GET', '/users/me', { cookie: target.cookie })).statusCode).toBe(401);
    const login = await call(t.app, 'POST', '/auth/login', {
      body: { email: target.email, password: STRONG_PASSWORD },
    });
    expect(login.statusCode).toBe(403);
    expect(errorCode(login)).toBe('ACCOUNT_SUSPENDED');
  });

  it('returns 404 for an unknown user', async () => {
    const admin = await signedInLearner(t, 'admin404');
    await makeAdmin(t.db, admin.userId);
    const response = await call(
      t.app,
      'PATCH',
      '/admin/users/00000000-0000-4000-8000-000000000000/role',
      {
        cookie: admin.cookie,
        body: { role: 'LEARNER' },
      },
    );
    expect(response.statusCode).toBe(404);
  });
});

describe('cross-site request protection', () => {
  it('blocks state-changing requests without the CSRF header', async () => {
    const { cookie } = await signedInLearner(t, 'csrf');
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie, origin: 'http://localhost:3000' },
    });
    expect(response.statusCode).toBe(403);
    expect(errorCode(response)).toBe('CSRF_CHECK_FAILED');
    expect((await call(t.app, 'GET', '/users/me', { cookie })).statusCode).toBe(200);
  });

  it('blocks requests from another origin even with the header', async () => {
    const { cookie } = await signedInLearner(t, 'csrforigin');
    const response = await call(t.app, 'POST', '/auth/logout', {
      cookie,
      headers: { origin: 'https://evil.example' },
    });
    expect(response.statusCode).toBe(403);
  });
});
