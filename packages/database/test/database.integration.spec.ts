import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPrismaClient,
  Prisma,
  RoleCode,
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
