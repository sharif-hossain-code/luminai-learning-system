import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMAIL_TRANSPORT, type MemoryEmailTransport } from '../src/email/email.transport.js';
import { JobDispatcher } from '../src/jobs/job-dispatcher.js';
import { WorkerModule } from '../src/worker.module.js';
import {
  call,
  startTestApp,
  STRONG_PASSWORD,
  testConfig,
  uniqueEmail,
  type TestApp,
} from './helpers.js';

/** Real BullMQ path: the API enqueues, a separate worker context sends the email. */
let api: TestApp;
let worker: INestApplicationContext;

beforeAll(async () => {
  api = await startTestApp({ JOBS_MODE: 'queue' });
  worker = await NestFactory.createApplicationContext(WorkerModule.forRoot(testConfig()), {
    logger: false,
  });
  await worker.init();
});

afterAll(async () => {
  await worker?.close();
  await api?.close();
});

async function waitFor<T>(probe: () => T | undefined, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = probe();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the worker');
}

describe('email queue', () => {
  it('delivers the verification email through the worker, with no token in the job', async () => {
    const email = uniqueEmail('queued');
    const response = await call(api.app, 'POST', '/auth/register', {
      body: { email, password: STRONG_PASSWORD, acceptTerms: true },
    });
    expect(response.statusCode).toBe(202);

    // The API process itself sent nothing; the worker did.
    expect(api.outbox.lastTo(email)).toBeUndefined();
    const workerOutbox = worker.get<MemoryEmailTransport>(EMAIL_TRANSPORT);
    const message = await waitFor(() => workerOutbox.lastTo(email));
    expect(message.text).toMatch(/\/verify-email\?token=[A-Za-z0-9_-]{43}/);

    // Job payloads hold only the job type and user ID.
    const dispatcher = api.app.get(JobDispatcher);
    const queue = (
      dispatcher as unknown as {
        queue: { getJobs: (types: string[]) => Promise<{ data: unknown }[]> };
      }
    ).queue;
    const jobs = await queue.getJobs(['completed']);
    for (const job of jobs) {
      expect(Object.keys(job.data as object).sort()).toEqual(['type', 'userId']);
    }
  });
});
