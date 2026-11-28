import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

// Load the repository-root .env for local development. In CI and deployed
// environments the variables come from the environment instead.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Not using env() so that commands which don't touch the database
    // (such as `prisma generate` in CI) work without DATABASE_URL.
    url: process.env.DATABASE_URL ?? '',
  },
});
