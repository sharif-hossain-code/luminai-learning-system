import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DependencyStatus, ReadinessResponse } from '@luminai/contracts';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';
import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async readiness(): Promise<ReadinessResponse> {
    const [database, redis] = await Promise.all([
      this.check('database', () => this.prisma.ping()),
      this.check('redis', () => this.redis.ping()),
    ]);
    return {
      status: database === 'up' && redis === 'up' ? 'ready' : 'degraded',
      checks: { database, redis },
    };
  }

  private async check(name: string, probe: () => Promise<void>): Promise<DependencyStatus> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), this.config.HEALTH_CHECK_TIMEOUT_MS);
    });
    try {
      await Promise.race([probe(), timeout]);
      return 'up';
    } catch (error) {
      // Log only the error type and code (e.g. ECONNREFUSED), never connection strings.
      this.logger.warn(`Readiness check failed for ${name}: ${describeError(error)}`);
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? `${error.name} (${code})` : error.name;
}
