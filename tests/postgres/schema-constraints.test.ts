import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Configuration } from '#src/configuration/configuration';
import { migrate } from '#src/infrastructure/postgres/migrate';

const configuration = Configuration.fromEnv();
const pool = new Pool({ connectionString: configuration.databaseUrl });

beforeAll(async () => {
  if (!configuration.databaseUrl.endsWith('/checkout_test'))
    throw new Error(
      'Schema tests require the dedicated checkout_test database',
    );
  await migrate(pool);
});
beforeEach(async () => {
  await pool.query(
    'TRUNCATE checkout_idempotency_keys, provider_events, orders',
  );
});
afterAll(() => pool.end());

type OrderRow = {
  publicId: string;
  reference: string;
  amount: string | number | null;
  currency: string | null;
  status: string | undefined;
};

const insertOrder = (overrides: Partial<OrderRow> = {}) => {
  const row: OrderRow = {
    publicId: randomUUID(),
    reference: `order-${randomUUID()}`,
    amount: '1999',
    currency: 'EUR',
    status: undefined,
    ...overrides,
  };
  return pool.query(
    `INSERT INTO orders (public_id, business_order_reference, amount_minor, currency, status)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'pending')) RETURNING *`,
    [row.publicId, row.reference, row.amount, row.currency, row.status],
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

const check = { code: '23514' };
const unique = { code: '23505' };
const notNull = { code: '23502' };
const foreignKey = { code: '23503' };

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

test.each(['0', '-1', '-9223372036854775808'])(
  'orders reject the non-positive amount %s',
  async (amount) => {
    await expect(insertOrder({ amount })).rejects.toMatchObject(check);
  },
);

test('orders accept the largest bigint amount and reject anything larger', async () => {
  const stored = await insertOrder({ amount: '9223372036854775807' });
  expect(stored.rows[0].amount_minor).toBe('9223372036854775807');
  await expect(
    insertOrder({ amount: '9223372036854775808' }),
  ).rejects.toMatchObject({ code: '22003' });
});

test.each(['eur', 'EU', 'EURO', 'E1R', '', ' EU', '€€€'])(
  'orders reject the currency %j',
  async (currency) => {
    await expect(insertOrder({ currency })).rejects.toMatchObject(check);
  },
);

test.each(['refunded', 'PENDING', 'Succeeded', '', 'cancelled'])(
  'orders reject the status %j',
  async (status) => {
    await expect(insertOrder({ status })).rejects.toMatchObject(check);
  },
);

test.each(['pending', 'failed', 'succeeded'])(
  'orders accept the status %s',
  async (status) => {
    expect((await insertOrder({ status })).rows[0].status).toBe(status);
  },
);

test.each([
  ['an empty reference', ''],
  ['a reference over 128 characters', 'x'.repeat(129)],
])('orders reject %s', async (_name, reference) => {
  await expect(insertOrder({ reference })).rejects.toMatchObject(check);
});

test('orders accept a 128 character reference and count characters, not bytes', async () => {
  await insertOrder({ reference: 'x'.repeat(128) });
  await insertOrder({ reference: '😀'.repeat(128) });
  expect(
    (await pool.query('SELECT count(*)::int AS n FROM orders')).rows[0].n,
  ).toBe(2);
});

test.each([
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

test('provider events enforce uniqueness, valid outcomes and length limits', async () => {
  const orderId = (await insertOrder()).rows[0].id;
  await insertEvent('evt-1', orderId);
  await expect(insertEvent('evt-1', orderId)).rejects.toMatchObject(unique);
  await expect(insertEvent('evt-2', orderId, 'pending')).rejects.toMatchObject(
    check,
  );
  await expect(insertEvent('', orderId)).rejects.toMatchObject(check);
  await expect(insertEvent('e'.repeat(129), orderId)).rejects.toMatchObject(
    check,
  );
  await expect(insertEvent('e'.repeat(128), orderId)).resolves.toBeDefined();
});

test('event IDs are unique across orders, not per order', async () => {
  const first = (await insertOrder()).rows[0].id;
  const second = (await insertOrder()).rows[0].id;
  await insertEvent('shared', first);
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

test('idempotency keys are unique, bounded and may share an order', async () => {
  const orderId = (await insertOrder()).rows[0].id;
  await insertKey('key-1', orderId);
  await expect(insertKey('key-1', orderId)).rejects.toMatchObject(unique);
  await expect(insertKey('', orderId)).rejects.toMatchObject(check);
  await expect(insertKey('k'.repeat(129), orderId)).rejects.toMatchObject(
    check,
  );
  await expect(insertKey('key-2', orderId)).resolves.toBeDefined();
  await expect(insertKey('k'.repeat(128), orderId)).resolves.toBeDefined();
});

test('text columns reject NUL characters', async () => {
  await expect(insertOrder({ reference: 'a\u0000b' })).rejects.toThrow();
});

test('uniqueness rules are backed by indexes', async () => {
  const indexes = await pool.query(
    `SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = current_schema()`,
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
