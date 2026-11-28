export { createPrismaClient, type CreatePrismaClientOptions } from './client.js';
export { PrismaClient, Prisma } from './generated/prisma/client.js';
export {
  AssessmentFeedbackMode,
  AttemptStatus,
  CourseLevel,
  CourseStatus,
  EnrollmentStatus,
  LessonCompletionRule,
  LessonProgressStatus,
  LessonResourceType,
  LessonType,
  QuestionType,
  RoleCode,
  UserStatus,
} from './generated/prisma/enums.js';
export type {
  Assessment,
  AssessmentAttempt,
  AttemptAnswer,
  AuditEvent,
  Category,
  Course,
  CourseVersion,
  Enrollment,
  Lesson,
  LessonProgress,
  LessonResource,
  Module,
  EmailVerificationToken,
  PasswordResetToken,
  Question,
  Role,
  Session,
  User,
  UserProfile,
} from './generated/prisma/client.js';
export { CATEGORY_DEFINITIONS, ROLE_DEFINITIONS, seedCategories, seedRoles } from './seed-data.js';
