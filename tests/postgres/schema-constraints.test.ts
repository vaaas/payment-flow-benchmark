import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Configuration } from '#src/configuration/configuration';
import { migrate } from '#src/infrastructure/postgres/migrate';

const schema = 'schema_constraints_test';
const configuration = Configuration.fromEnv();
const administration = new Pool({
  connectionString: configuration.databaseUrl,
  max: 1,
});
const pool = new Pool({
  connectionString: configuration.databaseUrl,
  options: `-c search_path=${schema}`,
});

beforeAll(async () => {
  if (!configuration.databaseUrl.endsWith('/checkout_test'))
    throw new Error(
      'Schema tests require the dedicated checkout_test database',
    );
  await administration.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await administration.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
});
beforeEach(async () => {
  await pool.query(
    'TRUNCATE checkout_idempotency_keys, provider_events, orders',
  );
});
afterAll(async () => {
  await administration.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.end();
  await administration.end();
});

type OrderRow = {
  publicId: string;
  reference: string | null;
  amount: string | null;
  currency: string | null;
};

const insertOrder = (overrides: Partial<OrderRow> = {}) => {
  const row: OrderRow = {
    publicId: randomUUID(),
    reference: `order-${randomUUID()}`,
    amount: '1999',
    currency: 'EUR',
    ...overrides,
  };
  return pool.query(
    `INSERT INTO orders (public_id, business_order_reference, amount_minor, currency)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [row.publicId, row.reference, row.amount, row.currency],
  );
};

const insertEvent = (eventId: string, orderId: number, outcome = 'failed') =>
  pool.query(
    'INSERT INTO provider_events (event_id, order_id, outcome) VALUES ($1, $2, $3)',
    [eventId, orderId, outcome],
  );

const insertKey = (key: string, orderId: number) =>
  pool.query(
    'INSERT INTO checkout_idempotency_keys (key, order_id) VALUES ($1, $2)',
    [key, orderId],
  );

const unique = { code: '23505' };
const notNull = { code: '23502' };
const foreignKey = { code: '23503' };

test('the schema declares structure only: value rules belong to the application parsers', async () => {
  const checks = await pool.query(
    `SELECT conname FROM pg_constraint
     JOIN pg_namespace ON pg_namespace.oid = connamespace
     WHERE nspname = $1 AND contype = 'c'`,
    [schema],
  );
  expect(checks.rows).toEqual([]);
});

test('a new order defaults to pending with matching creation timestamps', async () => {
  const { rows } = await insertOrder();
  expect(rows[0].status).toBe('pending');
  expect(rows[0].created_at).toEqual(rows[0].updated_at);
  expect(typeof rows[0].id).toBe('number');
});

test('serial keys increase and are never reused after deletion', async () => {
  const first = (await insertOrder()).rows[0].id;
  await pool.query('DELETE FROM orders');
  const second = (await insertOrder()).rows[0].id;
  expect(second).toBeGreaterThan(first);
});

test('orders accept the largest bigint amount and reject anything larger', async () => {
  const stored = await insertOrder({ amount: '9223372036854775807' });
  expect(stored.rows[0].amount_minor).toBe('9223372036854775807');
  await expect(
    insertOrder({ amount: '9223372036854775808' }),
  ).rejects.toMatchObject({ code: '22003' });
});

test.each([
  ['reference', { reference: null }],
  ['amount', { amount: null }],
  ['currency', { currency: null }],
])('orders require %s', async (_name, overrides) => {
  await expect(insertOrder(overrides)).rejects.toMatchObject(notNull);
});

test('business order references are unique and case-sensitive', async () => {
  await insertOrder({ reference: 'Unique' });
  await expect(insertOrder({ reference: 'Unique' })).rejects.toMatchObject(
    unique,
  );
  await expect(insertOrder({ reference: 'unique' })).resolves.toBeDefined();
});

test('public identifiers are unique', async () => {
  const publicId = randomUUID();
  await insertOrder({ publicId });
  await expect(insertOrder({ publicId })).rejects.toMatchObject(unique);
});

test('public identifiers must be valid UUIDs', async () => {
  await expect(insertOrder({ publicId: 'not-a-uuid' })).rejects.toMatchObject({
    code: '22P02',
  });
});

test('event IDs are unique across orders, not per order', async () => {
  const first = (await insertOrder()).rows[0].id;
  const second = (await insertOrder()).rows[0].id;
  await insertEvent('shared', first);
  await expect(insertEvent('shared', first)).rejects.toMatchObject(unique);
  await expect(insertEvent('shared', second)).rejects.toMatchObject(unique);
});

test('provider events and idempotency keys must reference an existing order', async () => {
  await expect(insertEvent('orphan', 987654)).rejects.toMatchObject(foreignKey);
  await expect(insertKey('orphan-key', 987654)).rejects.toMatchObject(
    foreignKey,
  );
});

test('an order with events or keys cannot be deleted out from under them', async () => {
  const orderId = (await insertOrder()).rows[0].id;
  await insertEvent('evt-1', orderId);
  await expect(
    pool.query('DELETE FROM orders WHERE id = $1', [orderId]),
  ).rejects.toMatchObject(foreignKey);
  await pool.query('DELETE FROM provider_events');
  await insertKey('key-1', orderId);
  await expect(
    pool.query('DELETE FROM orders WHERE id = $1', [orderId]),
  ).rejects.toMatchObject(foreignKey);
});

test('idempotency keys are unique and may share an order', async () => {
  const orderId = (await insertOrder()).rows[0].id;
  await insertKey('key-1', orderId);
  await expect(insertKey('key-1', orderId)).rejects.toMatchObject(unique);
  await expect(insertKey('key-2', orderId)).resolves.toBeDefined();
});

test('text columns reject NUL characters', async () => {
  await expect(insertOrder({ reference: 'a\u0000b' })).rejects.toThrow();
});

test('uniqueness rules are backed by indexes', async () => {
  const indexes = await pool.query(
    `SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = $1`,
    [schema],
  );
  const definitions = indexes.rows.map(
    (row: { tablename: string; indexdef: string }) =>
      `${row.tablename}: ${row.indexdef}`,
  );
  const mentions = (table: string, column: string) =>
    definitions.some(
      (definition: string) =>
        definition.startsWith(`${table}:`) &&
        definition.includes(`(${column})`),
    );
  expect(mentions('orders', 'public_id')).toBe(true);
  expect(mentions('orders', 'business_order_reference')).toBe(true);
  expect(mentions('provider_events', 'event_id')).toBe(true);
  expect(mentions('checkout_idempotency_keys', 'key')).toBe(true);
});
