import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AdminUsersController } from './admin-users.controller.js';

@Module({ imports: [IdentityModule], controllers: [AdminUsersController] })
export class AdminModule {}
