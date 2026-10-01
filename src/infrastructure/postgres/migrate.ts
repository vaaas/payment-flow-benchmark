import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { Configuration } from '#src/configuration/configuration';
export async function migrate(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(725831)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY)',
    );
    const applied = await client.query(
      'SELECT version FROM schema_migrations WHERE version = $1',
      ['001'],
    );
    if (!applied.rowCount) {
      await client.query(await readFile('migrations/001_initial.sql', 'utf8'));
      await client.query('INSERT INTO schema_migrations VALUES ($1)', ['001']);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
if (require.main === module) {
  const configuration = Configuration.fromEnv();
  const pool = new Pool({ connectionString: configuration.databaseUrl });
  migrate(pool)
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
