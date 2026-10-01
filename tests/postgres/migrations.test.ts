import { Pool } from 'pg';
import { Configuration } from '#src/configuration/configuration';
import { migrate } from '#src/infrastructure/postgres/migrate';

const configuration = Configuration.fromEnv();
const administration = new Pool({
  connectionString: configuration.databaseUrl,
});
const database = new Pool({
  connectionString: configuration.databaseUrl,
  options: '-c search_path=migration_test',
});

beforeAll(() => {
  if (!configuration.databaseUrl.endsWith('/checkout_test'))
    throw new Error(
      'Migration tests require the dedicated checkout_test database',
    );
});
beforeEach(async () => {
  await administration.query('DROP SCHEMA IF EXISTS migration_test CASCADE');
  await administration.query('CREATE SCHEMA migration_test');
});
afterAll(async () => {
  await administration.query('DROP SCHEMA IF EXISTS migration_test CASCADE');
  await database.end();
  await administration.end();
});

test('fresh migrations are repeatable and leave integer primary keys without policy triggers', async () => {
  await migrate(database);
  await migrate(database);
  const versions = await database.query(
    'SELECT version, id FROM schema_migrations ORDER BY version',
  );
  expect(versions.rows.map((row) => row.version)).toEqual(['001']);
  expect(versions.rows.every((row) => typeof row.id === 'number')).toBe(true);
  const keys =
    await database.query(`SELECT table_name, data_type FROM information_schema.columns
    WHERE table_schema='migration_test' AND column_name='id' ORDER BY table_name`);
  expect(keys.rows).toEqual([
    { table_name: 'orders', data_type: 'integer' },
    { table_name: 'provider_events', data_type: 'integer' },
    { table_name: 'schema_migrations', data_type: 'integer' },
  ]);
  const triggers = await database.query(`SELECT tgname FROM pg_trigger
    JOIN pg_class ON pg_class.oid=tgrelid JOIN pg_namespace ON pg_namespace.oid=relnamespace
    WHERE nspname='migration_test' AND NOT tgisinternal`);
  expect(triggers.rows).toEqual([]);
});
