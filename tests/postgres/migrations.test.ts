import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Configuration } from '#src/configuration/configuration';
import { migrate } from '#src/infrastructure/postgres/migrate';
import { PostgresOrderStore } from '#src/infrastructure/postgres/postgres-order-store';

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
  expect(versions.rows.map((row) => row.version)).toEqual([
    '001',
    '002',
    '003',
  ]);
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

test('upgrade preserves public identities, data, relationships, and event retries', async () => {
  await database.query(
    'CREATE TABLE schema_migrations (version text PRIMARY KEY)',
  );
  await database.query(await readFile('migrations/001_initial.sql', 'utf8'));
  await database.query("INSERT INTO schema_migrations VALUES ('001')");
  const publicId = '11111111-1111-4111-8111-111111111111';
  await database.query(
    `INSERT INTO orders (id, business_order_reference, amount_minor, currency, status)
    VALUES ($1, 'legacy-order', 1999, 'EUR', 'succeeded')`,
    [publicId],
  );
  await database.query(
    `INSERT INTO provider_events (event_id, order_id, outcome)
    VALUES ('legacy-event', $1, 'succeeded')`,
    [publicId],
  );
  const original = (await database.query('SELECT * FROM orders')).rows[0];

  await migrate(database);

  const storedOrder = (await database.query('SELECT * FROM orders')).rows[0];
  const storedEvent = (await database.query('SELECT * FROM provider_events'))
    .rows[0];
  expect(typeof storedOrder.id).toBe('number');
  expect(typeof storedEvent.id).toBe('number');
  expect(storedOrder.public_id).toBe(publicId);
  expect(storedEvent.order_id).toBe(storedOrder.id);
  expect(storedOrder.created_at).toEqual(original.created_at);
  expect(storedOrder.updated_at).toEqual(original.updated_at);
  const store = new PostgresOrderStore(drizzle(database));
  expect(
    await store.create({
      businessOrderReference: 'legacy-order',
      amountMinor: '1999',
      currency: 'EUR',
    }),
  ).toEqual({ order: await store.get(publicId), created: false });
  expect(
    await store.receive({
      eventId: 'legacy-event',
      orderId: publicId,
      outcome: 'succeeded',
    }),
  ).toEqual({ duplicate: true });
  await store.receive({
    eventId: 'late-failure',
    orderId: publicId,
    outcome: 'failed',
  });
  expect((await store.get(publicId)).status).toBe('succeeded');
  const created = await store.create({
    businessOrderReference: 'new-order',
    amountMinor: '2999',
    currency: 'EUR',
  });
  const inserted = (
    await database.query('SELECT id FROM orders WHERE public_id=$1', [
      created.order.id,
    ])
  ).rows[0];
  expect(inserted.id).toBeGreaterThan(storedOrder.id);
});
