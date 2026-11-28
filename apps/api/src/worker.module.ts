import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import type { AppConfig } from './config/env.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { EmailModule } from './email/email.module.js';
import { EmailJobProcessor } from './jobs/email-job.processor.js';
import { EmailWorker } from './jobs/email.worker.js';

/** The worker process: same domain code as the API, no HTTP server. */
@Module({})
export class WorkerModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: WorkerModule,
      imports: [ConfigModule.forRoot(config), DatabaseModule, EmailModule],
      providers: [EmailJobProcessor, EmailWorker],
    };
  }
}
