import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminModule } from './admin/admin.module.js';
import { AuditModule } from './audit/audit.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { CsrfGuard } from './common/csrf.guard.js';
import { ConfigModule } from './config/config.module.js';
import type { AppConfig } from './config/env.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { EmailModule } from './email/email.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthGuard } from './identity/auth.guard.js';
import { IdentityModule } from './identity/identity.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LearningModule } from './learning/learning.module.js';
import { OpenApiController } from './openapi/openapi.controller.js';
import { RateLimitGuard } from './rate-limit/rate-limit.guard.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { RedisModule } from './redis/redis.module.js';
import { UsersModule } from './users/users.module.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule,
        RedisModule,
        AuditModule,
        RateLimitModule,
        EmailModule,
        JobsModule,
        HealthModule,
        IdentityModule,
        UsersModule,
        AdminModule,
        CoursesModule,
        LearningModule,
      ],
      controllers: config.NODE_ENV === 'production' ? [] : [OpenApiController],
      // Guards run in this order: CSRF, then authentication/roles, then rate limits
      // (which can key on the signed-in user).
      providers: [
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useExisting: AuthGuard },
        { provide: APP_GUARD, useExisting: RateLimitGuard },
      ],
    };
  }
}
