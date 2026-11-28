import 'reflect-metadata';
import { LESSON_CONTENT_SCHEMA_VERSION } from '@luminai/contracts';
import { createPrismaClient, RoleCode, UserStatus } from '@luminai/database';
import { AuditService } from '../audit/audit.service.js';
import type { AppConfig } from '../config/env.schema.js';
import type { PrismaService } from '../database/prisma.service.js';
import { CourseAuthoringService, type Actor } from '../courses/course-authoring.service.js';
import { DEMO_COURSES } from './demo-courses.js';

/**
 * Publishes the sample catalogue through the same authoring service the API uses,
 * so demo data goes through the same validation, snapshots and audit trail.
 * Idempotent: courses whose slug already exists are skipped.
 *
 *   pnpm --filter @luminai/api seed:demo
 */

const DEMO_OWNER_EMAIL = 'content-team@luminai.local';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to load demo courses in production.');
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');

  const client = createPrismaClient({ connectionString, maxConnections: 2 });
  const prisma = { client } as PrismaService;
  // Only SESSION_SECRET is read (to hash client IPs, and there is no client IP here).
  const audit = new AuditService(prisma, { SESSION_SECRET: 'not-used-by-scripts' } as AppConfig);
  const authoring = new CourseAuthoringService(prisma, audit);

  try {
    const adminRole = await client.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } });
    // A content-team account that owns the samples. Its password hash is not a valid
    // hash, so nobody can sign in as it.
    const owner = await client.user.upsert({
      where: { email: DEMO_OWNER_EMAIL },
      update: {},
      create: {
        email: DEMO_OWNER_EMAIL,
        passwordHash: '!demo-content-owner-cannot-sign-in',
        roleId: adminRole.id,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        profile: { create: { displayName: 'Luminai content team' } },
      },
    });
    const actor: Actor = { userId: owner.id, sessionId: 'seed-script', role: RoleCode.ADMIN };
    const categories = new Map(
      (await client.category.findMany({ select: { id: true, slug: true } })).map((c) => [
        c.slug,
        c.id,
      ]),
    );

    let created = 0;
    for (const spec of DEMO_COURSES) {
      if (await client.course.findUnique({ where: { slug: spec.slug } })) continue;
      const categoryId = categories.get(spec.category);
      if (!categoryId) throw new Error(`Category ${spec.category} is missing; run pnpm db:seed.`);

      let course = await authoring.create(actor, {
        title: spec.title,
        categoryId,
        slug: spec.slug,
      });
      await authoring.update(actor, course.id, {
        summary: spec.summary,
        description: spec.description,
        level: spec.level,
        estimatedMinutes: spec.minutes,
        outcomes: spec.outcomes,
        prerequisites: spec.prerequisites ?? [],
        keywords: spec.keywords ?? [],
        featuredRank: spec.featuredRank ?? null,
      });
      for (const moduleSpec of spec.modules) {
        course = await authoring.createModule(actor, course.id, {
          title: moduleSpec.title,
          description: moduleSpec.description,
        });
        const moduleId = course.modules.at(-1)!.id;
        for (const lessonSpec of moduleSpec.lessons) {
          course = await authoring.createLesson(actor, moduleId, {
            title: lessonSpec.title,
            type: lessonSpec.type ?? 'TEXT',
          });
          const lessonId = course.modules.at(-1)!.lessons.at(-1)!.id;
          await authoring.updateLesson(actor, lessonId, {
            estimatedMinutes: lessonSpec.minutes,
            objectives: lessonSpec.objectives ?? [],
            content: { schemaVersion: LESSON_CONTENT_SCHEMA_VERSION, blocks: lessonSpec.blocks },
          });
          for (const resource of lessonSpec.resources ?? []) {
            await authoring.createResource(actor, lessonId, {
              type: resource.type,
              title: resource.title,
              externalUrl: resource.url,
            });
          }
        }
      }
      await authoring.publish(actor, course.id);
      created += 1;
    }
    console.log(
      `Demo courses: ${created} published, ${DEMO_COURSES.length - created} already there.`,
    );
  } finally {
    await client.$disconnect();
  }
}

await main();
