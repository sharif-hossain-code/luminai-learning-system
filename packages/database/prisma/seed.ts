import { createPrismaClient } from '../src/client.js';
import { seedRoles } from '../src/seed-data.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const prisma = createPrismaClient({ connectionString, maxConnections: 1 });

try {
  await seedRoles(prisma);
  const count = await prisma.role.count();
  console.log(`Seed complete: ${count} roles present.`);
} finally {
  await prisma.$disconnect();
}
