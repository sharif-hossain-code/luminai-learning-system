import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import './load-env.js';

/**
 * Resets the test database and applies all migrations, so the API's integration
 * tests never depend on another package's test run.
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL must be set to run integration tests.');
  const name = new URL(url).pathname.slice(1);
  if (!/test/i.test(name) || url === process.env.DATABASE_URL) {
    throw new Error(
      `Refusing to reset "${name}": TEST_DATABASE_URL must name a separate *test* database.`,
    );
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }

  const databasePackage = fileURLToPath(new URL('../../../packages/database', import.meta.url));
  for (const args of [
    ['exec', 'prisma', 'migrate', 'deploy'],
    ['exec', 'prisma', 'db', 'seed'],
  ]) {
    execFileSync('pnpm', args, {
      cwd: databasePackage,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
    });
  }
}
