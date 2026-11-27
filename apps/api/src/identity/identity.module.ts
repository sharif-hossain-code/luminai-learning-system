import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordHasher, SessionService, AuthGuard],
  exports: [SessionService, AuthGuard, PasswordHasher],
})
export class IdentityModule {}
