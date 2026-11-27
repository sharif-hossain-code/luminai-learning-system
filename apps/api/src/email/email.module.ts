import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';
import { EMAIL_TRANSPORT, MemoryEmailTransport, SmtpEmailTransport } from './email.transport.js';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_TRANSPORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.EMAIL_TRANSPORT === 'memory'
          ? new MemoryEmailTransport()
          : new SmtpEmailTransport(config),
    },
  ],
  exports: [EMAIL_TRANSPORT],
})
export class EmailModule {}
