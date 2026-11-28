import pg from 'pg';

/**
 * Test-only database access for the end-to-end suite. Accounts can only be promoted
 * by an administrator in the app, so tests that need a content editor or
 * administrator set the role directly in the test database.
 */
export async function setRole(email: string, role: 'CONTENT_EDITOR' | 'ADMIN'): Promise<void> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error('TEST_DATABASE_URL must be set.');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE users SET role_id = (SELECT id FROM roles WHERE code = $2) WHERE email = $1`,
      [email.toLowerCase(), role],
    );
    if (result.rowCount !== 1) throw new Error(`No user with email ${email}.`);
  } finally {
    await client.end();
  }
}
