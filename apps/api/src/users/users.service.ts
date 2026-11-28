import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type CurrentUser,
  type Preferences,
  type UpdatePreferencesRequest,
  type UpdateProfileRequest,
} from '@luminai/contracts';
import { AppError } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { canonicalLocale, isValidTimeZone } from './locale.js';
import { parsePreferences, toCurrentUser, userViewSelect } from './user-view.js';

/** Every method takes the caller's own user ID from the session, never from the client. */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<CurrentUser> {
    const row = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      select: userViewSelect,
    });
    return toCurrentUser(row);
  }

  async updateProfile(userId: string, input: UpdateProfileRequest): Promise<CurrentUser> {
    const data: Record<string, unknown> = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.learningGoals !== undefined) data.learningGoals = [...new Set(input.learningGoals)];
    if (input.locale !== undefined) {
      const locale = canonicalLocale(input.locale);
      if (!locale) throw fieldError('locale', 'Choose a valid language.');
      data.locale = locale;
    }
    if (input.timezone !== undefined) {
      if (!isValidTimeZone(input.timezone))
        throw fieldError('timezone', 'Choose a valid time zone.');
      data.timezone = input.timezone;
    }

    await this.prisma.client.userProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    return this.getMe(userId);
  }

  async getPreferences(userId: string): Promise<Partial<Preferences>> {
    const profile = await this.prisma.client.userProfile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    return parsePreferences(profile?.preferences);
  }

  /** Shallow merge: keys sent replace stored ones; `null` clears a value. */
  async updatePreferences(
    userId: string,
    input: UpdatePreferencesRequest,
  ): Promise<Partial<Preferences>> {
    return this.prisma.client.$transaction(async (tx) => {
      const profile = await tx.userProfile.upsert({
        where: { userId },
        update: {},
        create: { userId },
        select: { preferences: true },
      });
      const merged = { ...parsePreferences(profile.preferences), ...input };
      await tx.userProfile.update({ where: { userId }, data: { preferences: merged } });
      return merged;
    });
  }
}

function fieldError(field: string, message: string): AppError {
  return new AppError(
    ErrorCode.VALIDATION_FAILED,
    HttpStatus.UNPROCESSABLE_ENTITY,
    'Some fields are invalid.',
    [{ field, message }],
  );
}
