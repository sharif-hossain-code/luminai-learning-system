import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  errorEnvelopeSchema,
  livenessResponseSchema,
  readinessResponseSchema,
} from '@luminai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.factory.js';
import { testConfig } from './helpers.js';

describe('API with healthy dependencies', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp(testConfig());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/health/live returns ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health/live' });
    expect(response.statusCode).toBe(200);
    expect(livenessResponseSchema.parse(response.json())).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/health/ready reports both dependencies up', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(readinessResponseSchema.parse(response.json())).toEqual({
      status: 'ready',
      checks: { database: 'up', redis: 'up' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns a request ID header, reusing a safe incoming one', async () => {
    const generated = await app.inject({ method: 'GET', url: '/api/v1/health/live' });
    expect(generated.headers['x-request-id']).toMatch(/^req_[0-9a-f]{32}$/);

    const forwarded = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
      headers: { 'x-request-id': 'req_from_web_123' },
    });
    expect(forwarded.headers['x-request-id']).toBe('req_from_web_123');
  });

  it('answers unknown routes with the error envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });
    expect(response.statusCode).toBe(404);
    const body = errorEnvelopeSchema.parse(response.json());
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('requires the CSRF header on state-changing requests', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'CSRF_CHECK_FAILED' } });
  });

  it('does not serve routes outside the /api/v1 prefix', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(404);
  });

  it('allows CORS only from the configured web origin', async () => {
    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/health/live',
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/health/live',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sets security headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health/live' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
  });
});

describe('API with Redis unavailable', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    // Port 1 is never a Redis server, so every connection attempt fails.
    app = await createApp(testConfig({ REDIS_URL: 'redis://127.0.0.1:1' }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports degraded readiness with 503 and no connection details', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'degraded',
      checks: { database: 'up', redis: 'down' },
    });
    expect(response.body).not.toContain('127.0.0.1');
  });

  it('still reports liveness', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health/live' });
    expect(response.statusCode).toBe(200);
  });
});
