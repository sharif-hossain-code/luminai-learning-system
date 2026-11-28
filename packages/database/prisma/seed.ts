import { createPrismaClient } from '../src/client.js';
import { seedCategories, seedRoles } from '../src/seed-data.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const prisma = createPrismaClient({ connectionString, maxConnections: 1 });

try {
  await seedRoles(prisma);
  await seedCategories(prisma);
  const [roles, categories] = await Promise.all([prisma.role.count(), prisma.category.count()]);
  console.log(`Seed complete: ${roles} roles and ${categories} categories present.`);
} finally {
  await prisma.$disconnect();
}
