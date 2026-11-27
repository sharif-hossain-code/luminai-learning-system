import { API_ROUTES } from '@luminai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.factory.js';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { testConfig } from './helpers.js';

let app: NestFastifyApplication;
const registered = new Set<string>();

beforeAll(async () => {
  app = await createApp(testConfig());
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const method of methods) {
        if (method === 'HEAD' || method === 'OPTIONS') continue;
        registered.add(`${method} ${route.url}`);
      }
    });
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

describe('OpenAPI contract', () => {
  const documented = new Set(
    API_ROUTES.map((route) => `${route.method} /api/v1${route.path.replace(/\{(\w+)\}/g, ':$1')}`),
  );

  it('documents every API route', () => {
    const undocumented = [...registered]
      .filter((route) => route.startsWith('GET /api/v1') || route.includes(' /api/v1'))
      .filter((route) => !route.endsWith('/openapi.json') && !documented.has(route));
    expect(undocumented).toEqual([]);
  });

  it('has no documented route that is missing from the API', () => {
    const missing = [...documented].filter((route) => !registered.has(route));
    expect(missing).toEqual([]);
  });

  it('serves the OpenAPI document outside production', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ openapi: '3.1.0' });
  });
});
