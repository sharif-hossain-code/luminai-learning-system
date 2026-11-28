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
