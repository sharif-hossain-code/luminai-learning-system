import { Global, Module } from '@nestjs/common';
import { EmailJobProcessor } from './email-job.processor.js';
import { JobDispatcher } from './job-dispatcher.js';

@Global()
@Module({
  providers: [EmailJobProcessor, JobDispatcher],
  exports: [EmailJobProcessor, JobDispatcher],
})
export class JobsModule {}
