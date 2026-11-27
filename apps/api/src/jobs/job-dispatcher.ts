import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';
import { EMAIL_QUEUE, type EmailJob } from './email-jobs.js';
import { EmailJobProcessor } from './email-job.processor.js';

/**
 * Hands background work to the worker through BullMQ. In tests (JOBS_MODE=inline)
 * the processor runs in-process so flows can be checked end to end.
 */
@Injectable()
export class JobDispatcher implements OnModuleDestroy {
  private readonly logger = new Logger(JobDispatcher.name);
  private readonly queue?: Queue<EmailJob>;
  private readonly connection?: Redis;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly processor: EmailJobProcessor,
  ) {
    if (config.JOBS_MODE === 'queue') {
      this.connection = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: false,
      });
      this.connection.on('error', () => undefined); // reported by readiness
      this.queue = new Queue<EmailJob>(EMAIL_QUEUE, { connection: this.connection });
    }
  }

  /**
   * Never throws: the caller has already committed its database changes, and the
   * user can always ask again (resend). Failures are logged with the job type only.
   */
  async dispatchEmail(job: EmailJob): Promise<void> {
    try {
      if (!this.queue) {
        await this.processor.process(job);
        return;
      }
      await this.queue.add(job.type, job, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        // Kept for inspection and safe retry; see docs/operations.
        removeOnFail: { age: 14 * 24 * 3600 },
      });
    } catch (error) {
      this.logger.error(
        `Could not dispatch ${job.type} email job: ${error instanceof Error ? error.name : 'error'}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
