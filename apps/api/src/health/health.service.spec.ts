import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.schema.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';
import { HealthService } from './health.service.js';

const config = { HEALTH_CHECK_TIMEOUT_MS: 100 } as AppConfig;

function service(db: () => Promise<void>, redis: () => Promise<void>) {
  return new HealthService(
    config,
    { ping: vi.fn(db) } as unknown as PrismaService,
    {
      ping: vi.fn(redis),
    } as unknown as RedisService,
  );
}

describe('HealthService.readiness', () => {
  it('is ready when every dependency answers', async () => {
    const result = await service(
      async () => {},
      async () => {},
    ).readiness();
    expect(result).toEqual({ status: 'ready', checks: { database: 'up', redis: 'up' } });
  });

  it('is degraded when the database fails', async () => {
    const result = await service(
      () => Promise.reject(new Error('ECONNREFUSED')),
      async () => {},
    ).readiness();
    expect(result).toEqual({ status: 'degraded', checks: { database: 'down', redis: 'up' } });
  });

  it('treats a dependency that hangs past the timeout as down', async () => {
    const result = await service(
      async () => {},
      () => new Promise(() => {}),
    ).readiness();
    expect(result).toEqual({ status: 'degraded', checks: { database: 'up', redis: 'down' } });
  });
});
