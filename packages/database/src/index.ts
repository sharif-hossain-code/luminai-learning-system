export { createPrismaClient, type CreatePrismaClientOptions } from './client.js';
export { PrismaClient, Prisma } from './generated/prisma/client.js';
export {
  CourseLevel,
  CourseStatus,
  LessonCompletionRule,
  LessonResourceType,
  LessonType,
  RoleCode,
  UserStatus,
} from './generated/prisma/enums.js';
export type {
  AuditEvent,
  Category,
  Course,
  CourseVersion,
  Lesson,
  LessonResource,
  Module,
  EmailVerificationToken,
  PasswordResetToken,
  Role,
  Session,
  User,
  UserProfile,
} from './generated/prisma/client.js';
export { CATEGORY_DEFINITIONS, ROLE_DEFINITIONS, seedCategories, seedRoles } from './seed-data.js';
