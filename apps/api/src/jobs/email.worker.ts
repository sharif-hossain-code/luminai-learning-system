import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';
import { EMAIL_QUEUE, type EmailJob } from './email-jobs.js';
import { EmailJobProcessor } from './email-job.processor.js';

/** Consumes the email queue. Retries with exponential backoff are set when jobs are added. */
@Injectable()
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorker.name);
  private worker?: Worker<EmailJob>;
  private connection?: Redis;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly processor: EmailJobProcessor,
  ) {}

  onModuleInit(): void {
    // BullMQ workers need maxRetriesPerRequest: null on their connection.
    this.connection = new Redis(this.config.REDIS_URL, { maxRetriesPerRequest: null });
    this.worker = new Worker<EmailJob>(EMAIL_QUEUE, (job) => this.processor.process(job.data), {
      connection: this.connection,
      concurrency: 5,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.warn(
        `Email job ${job?.name ?? 'unknown'} attempt ${job?.attemptsMade ?? '?'} failed: ${error.name}`,
      );
    });
    this.worker.on('error', (error) => this.logger.error(`Email worker error: ${error.name}`));
    this.logger.log('Email worker started');
  }

  /** Graceful drain: finish in-flight jobs, then close. */
  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit().catch(() => undefined);
  }
}
