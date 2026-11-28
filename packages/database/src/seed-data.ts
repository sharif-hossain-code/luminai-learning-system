import type { PrismaClient } from './generated/prisma/client.js';
import { RoleCode } from './generated/prisma/enums.js';

export const ROLE_DEFINITIONS = [
  {
    code: RoleCode.LEARNER,
    name: 'Learner',
    description: 'Browses courses, learns, takes assessments and uses their own AI mentor.',
  },
  {
    code: RoleCode.CONTENT_EDITOR,
    name: 'Content editor',
    description:
      'Creates and edits assigned course drafts. Publishes only with explicit permission.',
  },
  {
    code: RoleCode.ADMIN,
    name: 'Administrator',
    description:
      'Manages users, roles, content and platform settings. Sensitive actions are audited.',
  },
] as const;

/** Idempotent: safe to run any number of times. */
export async function seedRoles(prisma: PrismaClient): Promise<void> {
  for (const role of ROLE_DEFINITIONS) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: role,
    });
  }
}

/** The three learning domains are the first catalogue categories. Admins can add more. */
export const CATEGORY_DEFINITIONS = [
  {
    slug: 'language',
    name: 'Language',
    description: 'Grammar, vocabulary, writing, professional English and pronunciation.',
    displayOrder: 0,
  },
  {
    slug: 'communication',
    name: 'Communication',
    description: 'Public speaking, presentations, listening and negotiation.',
    displayOrder: 1,
  },
  {
    slug: 'leadership',
    name: 'Leadership',
    description: 'Decisions, teamwork, conflict resolution and emotional intelligence.',
    displayOrder: 2,
  },
] as const;

/** Idempotent. Creates missing categories; never overwrites an admin's edits. */
export async function seedCategories(prisma: PrismaClient): Promise<void> {
  for (const category of CATEGORY_DEFINITIONS) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }
}
