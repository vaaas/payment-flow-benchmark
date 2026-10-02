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
    { table_name: 'checkout_idempotency_keys', data_type: 'integer' },
    { table_name: 'orders', data_type: 'integer' },
    { table_name: 'provider_events', data_type: 'integer' },
    { table_name: 'schema_migrations', data_type: 'integer' },
  ]);
  const triggers = await database.query(`SELECT tgname FROM pg_trigger
    JOIN pg_class ON pg_class.oid=tgrelid JOIN pg_namespace ON pg_namespace.oid=relnamespace
    WHERE nspname='migration_test' AND NOT tgisinternal`);
  expect(triggers.rows).toEqual([]);
});

test('concurrent migrations on a fresh database apply each version exactly once', async () => {
  await Promise.all(Array.from({ length: 6 }, () => migrate(database)));
  const versions = await database.query(
    'SELECT version FROM schema_migrations',
  );
  expect(versions.rows).toEqual([{ version: '001' }]);
  const tables = await database.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'migration_test' ORDER BY table_name`,
  );
  expect(tables.rows.map((row) => row.table_name)).toEqual([
    'checkout_idempotency_keys',
    'orders',
    'provider_events',
    'schema_migrations',
  ]);
});

test('re-running migrations preserves existing data', async () => {
  await migrate(database);
  await database.query(
    `INSERT INTO orders (public_id, business_order_reference, amount_minor, currency)
     VALUES ('11111111-1111-4111-8111-111111111111', 'kept', 1999, 'EUR')`,
  );
  await migrate(database);
  const rows = await database.query(
    'SELECT business_order_reference FROM orders',
  );
  expect(rows.rows).toEqual([{ business_order_reference: 'kept' }]);
});

test('migrations adopt a database whose versions are already recorded', async () => {
  await migrate(database);
  await database.query('DROP TABLE checkout_idempotency_keys');
  await migrate(database);
  const tables = await database.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'migration_test' AND table_name = 'checkout_idempotency_keys'`,
  );
  expect(tables.rows).toEqual([]);
});

test('a migration that cannot run leaves no version recorded and releases its connection', async () => {
  await database.query('CREATE TABLE orders (id integer)');
  await expect(migrate(database)).rejects.toThrow();
  const recorded = await database.query(
    `SELECT count(*)::int AS total FROM information_schema.tables
     WHERE table_schema = 'migration_test' AND table_name = 'schema_migrations'`,
  );
  expect(recorded.rows[0].total).toBe(0);
  await database.query('DROP TABLE orders');
  await migrate(database);
  const versions = await database.query(
    'SELECT version FROM schema_migrations',
  );
  expect(versions.rows).toEqual([{ version: '001' }]);
});
