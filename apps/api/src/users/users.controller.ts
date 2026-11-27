import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  updatePreferencesRequestSchema,
  updateProfileRequestSchema,
  type CurrentUser,
  type Preferences,
  type UpdatePreferencesRequest,
  type UpdateProfileRequest,
} from '@luminai/contracts';
import { type AuthContext, CurrentAuth } from '../identity/auth-context.js';
import { UsersService } from './users.service.js';

/** "me" routes only: there is deliberately no route that takes another user's ID. */
@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async getMe(@CurrentAuth() auth: AuthContext): Promise<{ data: CurrentUser }> {
    return { data: await this.users.getMe(auth.userId) };
  }

  @Patch('profile')
  async updateProfile(
    @CurrentAuth() auth: AuthContext,
    @Body({ schema: updateProfileRequestSchema }) body: UpdateProfileRequest,
  ): Promise<{ data: CurrentUser }> {
    return { data: await this.users.updateProfile(auth.userId, body) };
  }

  @Get('preferences')
  async getPreferences(@CurrentAuth() auth: AuthContext): Promise<{ data: Partial<Preferences> }> {
    return { data: await this.users.getPreferences(auth.userId) };
  }

  @Patch('preferences')
  async updatePreferences(
    @CurrentAuth() auth: AuthContext,
    @Body({ schema: updatePreferencesRequestSchema }) body: UpdatePreferencesRequest,
  ): Promise<{ data: Partial<Preferences> }> {
    return { data: await this.users.updatePreferences(auth.userId, body) };
  }
}
