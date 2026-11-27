import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';
import { RedisService } from '../redis/redis.service.js';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Fixed-window counters in Redis, shared by every API instance. */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(
    private readonly redis: RedisService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async consume(
    name: string,
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    if (!this.config.RATE_LIMIT_ENABLED) return { allowed: true, retryAfterSeconds: 0 };

    // Hash the key so emails and IPs never appear in Redis in plain text.
    const digest = createHash('sha256').update(key).digest('hex').slice(0, 32);
    const redisKey = `rl:${name}:${digest}`;
    try {
      const results = await this.redis.client
        .multi()
        .incr(redisKey)
        .expire(redisKey, windowSeconds, 'NX')
        .ttl(redisKey)
        .exec();
      const count = Number(results?.[0]?.[1] ?? 0);
      const ttl = Number(results?.[2]?.[1] ?? windowSeconds);
      return { allowed: count <= limit, retryAfterSeconds: Math.max(ttl, 1) };
    } catch (error) {
      // Fail open: a Redis outage must not lock everyone out. Readiness and
      // monitoring report the outage; see docs/assumptions.md.
      this.logger.error(
        `Rate limit check skipped (${name}): ${error instanceof Error ? error.name : 'error'}`,
      );
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }

  /** Clears a bucket, e.g. the failed-login counter after a successful sign-in. */
  async reset(name: string, key: string): Promise<void> {
    const digest = createHash('sha256').update(key).digest('hex').slice(0, 32);
    try {
      await this.redis.client.del(`rl:${name}:${digest}`);
    } catch {
      // Best effort.
    }
  }
}
