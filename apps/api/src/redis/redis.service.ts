import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';

/**
 * Shared Redis connection. Phase 1 uses it only for readiness checks;
 * caching, rate limits and queues are added when a feature needs them.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      // Fail commands immediately while disconnected instead of queueing them,
      // so a Redis outage shows up as a fast readiness failure, not a hang.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: config.HEALTH_CHECK_TIMEOUT_MS,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    });
    // Without a listener, ioredis reports connection errors as unhandled events.
    // The message is logged without the connection URL.
    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis connection error: ${error.name}`);
    });
  }

  /**
   * Connects during startup so the first readiness check is accurate. A Redis
   * outage does not stop the API from starting: readiness reports it instead,
   * and ioredis keeps retrying in the background.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
    } catch {
      this.logger.warn('Redis is unavailable at startup; will keep retrying.');
    }
  }

  async ping(): Promise<void> {
    const reply = await this.client.ping();
    if (reply !== 'PONG') {
      throw new Error('Unexpected Redis PING reply');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'ready') {
      await this.client.quit();
    } else {
      this.client.disconnect();
    }
  }
}
