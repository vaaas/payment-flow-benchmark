import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { Configuration } from '#src/configuration/configuration';
export async function migrate(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(725831)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (id serial PRIMARY KEY, version text NOT NULL UNIQUE)',
    );
    const applied = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations',
    );
    const appliedVersions = new Set(applied.rows.map((row) => row.version));
    const filenames = (await readdir('migrations'))
      .filter((filename) => /^\d+_.+\.sql$/.test(filename))
      .sort();
    for (const filename of filenames) {
      const version = filename.slice(0, filename.indexOf('_'));
      if (appliedVersions.has(version)) continue;
      await client.query(await readFile(`migrations/${filename}`, 'utf8'));
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [version],
      );
      appliedVersions.add(version);
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
