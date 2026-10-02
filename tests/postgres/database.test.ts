import request from 'supertest';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { Container } from '#src/application/dependency-injection/container';
import { installFeatures } from '#src/bootstrap/install-features';
import { Configuration } from '#src/configuration/configuration';
import { App } from '#src/http/app';
import { Database } from '#src/infrastructure/postgres/database';
import { DatabaseUnavailable } from '#src/infrastructure/postgres/database-unavailable';
import { installPostgresStores } from '#src/bootstrap/install-postgres-stores';
import { migrate } from '#src/infrastructure/postgres/migrate';

const configuration = Configuration.fromEnv();
const administration = new Pool({
  connectionString: configuration.databaseUrl,
});
const databases: Database[] = [];

beforeAll(async () => {
  if (!configuration.databaseUrl.endsWith('/checkout_test'))
    throw new Error('Database tests require checkout_test');
  await migrate(administration);
});
beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
  jest.restoreAllMocks();
});
afterAll(() => administration.end());

function createApp(database: Database): App {
  databases.push(database);
  const container = new Container()
    .registerInstance(Configuration, configuration)
    .registerInstance(Database, database)
    .install(installPostgresStores);
  return container.get(App).install(installFeatures);
}

const orderId = '11111111-1111-4111-8111-111111111111';

test('startup is lazy, failed initialization returns a relevant 503, and a later request retries', async () => {
  let attempts = 0;
  const createPool = jest.fn((options: PoolConfig) => {
    attempts++;
    return new Pool(
      attempts === 1
        ? {
            ...options,
            connectionString:
              'postgresql://postgres:benchmark@127.0.0.1:1/checkout_test',
            connectionTimeoutMillis: 100,
          }
        : options,
    );
  });
  const database = new Database(configuration, createPool);
  const app = createApp(database);
  expect(createPool).not.toHaveBeenCalled();
  const first = await request(app.http)
    .get(`/orders/${orderId}`)
    .set('Authorization', `Bearer ${configuration.apiKey}`);
  expect(first.status).toBe(503);
  expect(first.body).toEqual({
    error: 'Cannot connect to the database; retry later',
  });
  const second = await request(app.http)
    .get(`/orders/${orderId}`)
    .set('Authorization', `Bearer ${configuration.apiKey}`);
  expect(second.status).toBe(404);
  expect(createPool).toHaveBeenCalledTimes(2);
});

test('concurrent first requests initialize only one shared pool', async () => {
  const createPool = jest.fn((options: PoolConfig) => new Pool(options));
  const app = createApp(new Database(configuration, createPool));
  const responses = await Promise.all(
    Array.from({ length: 20 }, () =>
      request(app.http)
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${configuration.apiKey}`),
    ),
  );
  expect(responses.every((response) => response.status === 404)).toBe(true);
  expect(createPool).toHaveBeenCalledTimes(1);
});

test('terminating an idle backend is handled and subsequent connections recover', async () => {
  const pools: Pool[] = [];
  const database = new Database(configuration, (options) => {
    const pool = new Pool(options);
    pools.push(pool);
    return pool;
  });
  databases.push(database);
  const client = await database.connect();
  const backend = await client.query<{ pid: number }>(
    'SELECT pg_backend_pid() AS pid',
  );
  const row = backend.rows[0];
  const pool = pools[0];
  if (!row || !pool) throw new Error('Expected initialized database');
  const idleError = new Promise<void>((resolve) =>
    pool.once('error', () => resolve()),
  );
  client.release();
  await administration.query('SELECT pg_terminate_backend($1)', [row.pid]);
  await idleError;
  expect(console.error).toHaveBeenCalledWith(
    'PostgreSQL idle connection failed',
    expect.any(Error),
  );
  const recovered = await database.connect();
  try {
    expect((await recovered.query('SELECT 1 AS value')).rows[0].value).toBe(1);
  } finally {
    recovered.release();
  }
});

test('terminating an active backend rejects the query without an unhandled error and recovers', async () => {
  const database = new Database(configuration);
  databases.push(database);
  const client = await database.connect();
  const row = (
    await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
  ).rows[0];
  if (!row) throw new Error('Expected backend PID');
  const failedQuery = expect(
    client.query('SELECT pg_sleep(10)'),
  ).rejects.toThrow();
  try {
    await administration.query('SELECT pg_terminate_backend($1)', [row.pid]);
    await failedQuery;
  } finally {
    client.release(true);
  }
  const recovered = await database.connect();
  try {
    expect((await recovered.query('SELECT 1 AS value')).rows[0].value).toBe(1);
  } finally {
    recovered.release();
  }
});

test('closed databases cannot initialize another pool', async () => {
  const createPool = jest.fn((options: PoolConfig) => new Pool(options));
  const database = new Database(configuration, createPool);
  await database.close();
  await expect(database.connect()).rejects.toBeInstanceOf(DatabaseUnavailable);
  expect(createPool).not.toHaveBeenCalled();
});

test('concurrent close calls wait for the same complete disposal', async () => {
  const database = new Database(configuration);
  databases.push(database);
  const client = await database.connect();
  const first = database.close();
  const second = database.close();
  let finished = false;
  void first.then(() => {
    finished = true;
  });
  try {
    expect(second).toBe(first);
    await new Promise((resolve) => setImmediate(resolve));
    expect(finished).toBe(false);
  } finally {
    client.release();
  }
  await Promise.all([first, second]);
  expect(finished).toBe(true);
});

test('close during initialization disposes the candidate pool instead of publishing it', async () => {
  const pools: Pool[] = [];
  const database = new Database(configuration, (options) => {
    const pool = new Pool(options);
    pools.push(pool);
    return pool;
  });
  databases.push(database);
  const connecting = expect(database.connect()).rejects.toBeInstanceOf(
    DatabaseUnavailable,
  );
  await Promise.all([connecting, database.close()]);
  expect(pools).toHaveLength(1);
  expect(pools[0]?.ended).toBe(true);
});

test('connection termination inside a checkout transaction returns 503, releases its client, and allows retry', async () => {
  const database = new Database(configuration);
  const app = createApp(database);
  await administration.query(
    `CREATE FUNCTION terminate_test_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_terminate_backend(pg_backend_pid()); RETURN NEW; END; $$`,
  );
  await administration.query(
    'CREATE TRIGGER terminate_test_insert BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION terminate_test_insert()',
  );
  const payload = {
    businessOrderReference: 'terminated-checkout',
    amountMinor: '1999',
    currency: 'EUR',
  };
  const checkout = () =>
    request(app.http)
      .post('/checkout-intents')
      .set('Authorization', `Bearer ${configuration.apiKey}`)
      .set('Idempotency-Key', 'terminated-checkout-key')
      .send(payload);
  try {
    expect((await checkout()).status).toBe(503);
    expect(
      (
        await administration.query(
          'SELECT id FROM orders WHERE business_order_reference=$1',
          [payload.businessOrderReference],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await administration.query(
          'SELECT id FROM checkout_idempotency_keys WHERE key=$1',
          ['terminated-checkout-key'],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await administration.query('DROP TRIGGER terminate_test_insert ON orders');
    await administration.query('DROP FUNCTION terminate_test_insert()');
  }
  expect((await checkout()).status).toBe(201);
});
