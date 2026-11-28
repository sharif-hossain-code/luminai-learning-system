import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPrismaClient,
  Prisma,
  RoleCode,
  seedCategories,
  seedRoles,
  type PrismaClient,
} from '../src/index.js';

let prisma: PrismaClient;

beforeAll(() => {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error('TEST_DATABASE_URL must be set.');
  prisma = createPrismaClient({ connectionString, maxConnections: 2 });
});

afterAll(async () => {
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('seed', () => {
  it('creates the three roles and is idempotent', async () => {
    await seedRoles(prisma);
    await seedRoles(prisma);

    const roles = await prisma.role.findMany({ orderBy: { code: 'asc' } });
    expect(roles.map((role) => role.code)).toEqual([
      RoleCode.LEARNER,
      RoleCode.CONTENT_EDITOR,
      RoleCode.ADMIN,
    ]);
  });
});

describe('users table integrity', () => {
  async function learnerRoleId(): Promise<string> {
    await seedRoles(prisma);
    const role = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.LEARNER } });
    return role.id;
  }

  it('generates UUID primary keys and defaults the status to pending verification', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'uuid.check@example.test',
        passwordHash: 'hash',
        roleId: await learnerRoleId(),
      },
    });
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.status).toBe('PENDING_VERIFICATION');
  });

  it('rejects an email that is not normalized to lower case', async () => {
    const roleId = await learnerRoleId();
    await expect(
      prisma.user.create({
        data: { email: 'Mixed.Case@Example.test', passwordHash: 'hash', roleId },
      }),
    ).rejects.toThrow();
  });

  it('rejects duplicate emails', async () => {
    const roleId = await learnerRoleId();
    await prisma.user.create({ data: { email: 'dup@example.test', passwordHash: 'hash', roleId } });
    await expect(
      prisma.user.create({ data: { email: 'dup@example.test', passwordHash: 'hash', roleId } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('deletes profile and sessions with their user', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'cascade@example.test',
        passwordHash: 'hash',
        roleId: await learnerRoleId(),
        profile: { create: { displayName: 'Cascade' } },
        sessions: {
          create: { tokenHash: 'cascade-token-hash', expiresAt: new Date(Date.now() + 60_000) },
        },
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.userProfile.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('prevents deleting a role that users still reference', async () => {
    const roleId = await learnerRoleId();
    await prisma.user.create({
      data: { email: 'restrict@example.test', passwordHash: 'hash', roleId },
    });
    await expect(prisma.role.delete({ where: { id: roleId } })).rejects.toThrow();
  });
});

describe('course content integrity', () => {
  async function course(slug: string) {
    await seedRoles(prisma);
    await seedCategories(prisma);
    const roleId = (await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } })).id;
    const owner = await prisma.user.create({
      data: { email: `${slug}@example.test`, passwordHash: 'hash', roleId },
    });
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: 'language' } });
    return prisma.course.create({
      data: { slug, title: 'Course', categoryId: category.id, ownerId: owner.id },
    });
  }

  it('seeds the three domain categories idempotently', async () => {
    await seedCategories(prisma);
    await seedCategories(prisma);
    const slugs = (await prisma.category.findMany({ orderBy: { displayOrder: 'asc' } })).map(
      (c) => c.slug,
    );
    expect(slugs).toEqual(['language', 'communication', 'leadership']);
  });

  it('enforces unique, well-formed slugs', async () => {
    await course('unique-course');
    await expect(course('unique-course')).rejects.toThrow();
    await expect(course('Not A Slug')).rejects.toThrow();
  });

  it('allows only https links and exactly one location per resource', async () => {
    const created = await course('resource-course');
    const module = await prisma.module.create({
      data: { courseId: created.id, title: 'M', position: 0 },
    });
    const lesson = await prisma.lesson.create({
      data: { moduleId: module.id, title: 'L', position: 0 },
    });
    const base = { lessonId: lesson.id, type: 'LINK' as const, title: 'R', position: 0 };
    await expect(
      prisma.lessonResource.create({ data: { ...base, externalUrl: 'javascript:alert(1)' } }),
    ).rejects.toThrow();
    await expect(prisma.lessonResource.create({ data: base })).rejects.toThrow();
    await expect(
      prisma.lessonResource.create({
        data: { ...base, externalUrl: 'https://example.com', storageKey: 'key' },
      }),
    ).rejects.toThrow();
    await prisma.lessonResource.create({ data: { ...base, externalUrl: 'https://example.com' } });
  });

  it('numbers versions uniquely per course and fills the search vector', async () => {
    const created = await course('versioned-course');
    const version = {
      courseId: created.id,
      categoryId: created.categoryId,
      title: 'Negotiation basics',
      summary: 'Reach fair agreements',
      level: 'BEGINNER' as const,
      estimatedMinutes: 60,
      moduleCount: 1,
      lessonCount: 1,
      searchText: 'bargaining',
      snapshot: {},
      draftRevision: 1,
    };
    await prisma.courseVersion.create({ data: { ...version, version: 1 } });
    await expect(prisma.courseVersion.create({ data: { ...version, version: 1 } })).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );
    const hits = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM course_versions
      WHERE course_id = ${created.id}::uuid
        AND search_vector @@ websearch_to_tsquery('english', 'bargain')`;
    expect(Number(hits[0]?.n)).toBe(1);
  });
});
