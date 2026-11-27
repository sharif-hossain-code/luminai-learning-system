import 'reflect-metadata';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@luminai/contracts';
import { createPrismaClient, type PrismaClient } from '@luminai/database';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../src/app.factory.js';
import { loadConfig } from '../src/config/env.schema.js';
import { EMAIL_TRANSPORT, type MemoryEmailTransport } from '../src/email/email.transport.js';
import { RedisService } from '../src/redis/redis.service.js';

export const WEB_ORIGIN = 'http://localhost:3000';
export const STRONG_PASSWORD = 'correct horse battery staple';

export function testConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    WEB_URL: WEB_ORIGIN,
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    HEALTH_CHECK_TIMEOUT_MS: '1000',
    EMAIL_TRANSPORT: 'memory',
    JOBS_MODE: 'inline',
    RATE_LIMIT_ENABLED: 'false',
    ...overrides,
  });
}

export interface TestApp {
  app: NestFastifyApplication;
  outbox: MemoryEmailTransport;
  db: PrismaClient;
  redis: RedisService;
  close(): Promise<void>;
}

export async function startTestApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  const app = await createApp(testConfig(overrides));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const db = createPrismaClient({
    connectionString: process.env.TEST_DATABASE_URL!,
    maxConnections: 2,
  });
  return {
    app,
    outbox: app.get<MemoryEmailTransport>(EMAIL_TRANSPORT),
    db,
    redis: app.get(RedisService),
    async close() {
      await db.$disconnect();
      await app.close();
    },
  };
}

let counter = 0;
/** A unique email per call so tests never collide. */
export function uniqueEmail(label = 'user'): string {
  counter += 1;
  return `${label}.${Date.now().toString(36)}.${counter}@example.test`;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Sends a request the way the web app does: JSON, same-origin, with the CSRF header. */
export function call(
  app: NestFastifyApplication,
  method: Method,
  path: string,
  options: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {},
) {
  return app.inject({
    method,
    url: `/api/v1${path}`,
    headers: {
      ...(method === 'GET' ? {} : { [CSRF_HEADER]: CSRF_HEADER_VALUE, origin: WEB_ORIGIN }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    ...(options.body !== undefined ? { payload: options.body as Record<string, unknown> } : {}),
  });
}

/** Pulls the token out of the link in the most recent email to `to`. */
export function tokenFromEmail(outbox: MemoryEmailTransport, to: string, path: string): string {
  const message = outbox.lastTo(to);
  if (!message) throw new Error(`No email sent to ${to}`);
  const match = new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`).exec(message.text);
  if (!match?.[1]) throw new Error(`No ${path} link in email to ${to}`);
  return match[1];
}

/** "name=value" from a Set-Cookie header, for sending back as a Cookie header. */
export function sessionCookieFrom(response: { headers: Record<string, unknown> }): string {
  const header = response.headers['set-cookie'];
  const first = Array.isArray(header) ? String(header[0]) : String(header);
  return first.split(';')[0]!;
}

/** Registers, verifies and signs in a learner. Returns their email and session cookie. */
export async function signedInLearner(t: TestApp, label = 'learner') {
  const email = uniqueEmail(label);
  await call(t.app, 'POST', '/auth/register', {
    body: { email, password: STRONG_PASSWORD, displayName: label, acceptTerms: true },
  });
  const token = tokenFromEmail(t.outbox, email, '/verify-email');
  await call(t.app, 'POST', '/auth/verify-email', { body: { token } });
  const login = await call(t.app, 'POST', '/auth/login', {
    body: { email, password: STRONG_PASSWORD },
  });
  if (login.statusCode !== 200) throw new Error(`Login failed: ${login.statusCode} ${login.body}`);
  const user = login.json<{ data: { id: string } }>().data;
  return { email, cookie: sessionCookieFrom(login), userId: user.id };
}

export async function makeAdmin(db: PrismaClient, userId: string): Promise<void> {
  const role = await db.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  await db.user.update({ where: { id: userId }, data: { roleId: role.id } });
}
