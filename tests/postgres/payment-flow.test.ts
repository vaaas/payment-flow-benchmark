import { installFeatures } from '#src/bootstrap/install-features';
import { OrderStore } from '#src/features/orders/domain/order-store';
import { Container } from '#src/application/dependency-injection/container';
import request from 'supertest';
import { Configuration } from '#src/configuration/configuration';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { App } from '#src/http/app';
import { PostgresOrderStore } from '#src/infrastructure/postgres/postgres-order-store';
import { migrate } from '#src/infrastructure/postgres/migrate';
const configuration = Configuration.fromEnv();
const pool = new Pool({ connectionString: configuration.databaseUrl, max: 20 });
const container = new Container()
  .registerInstance(Pool, pool)
  .registerInstance(Configuration, configuration)
  .register(OrderStore, PostgresOrderStore);
const store = container.get(OrderStore);
const application = container.get(App).install(installFeatures);
const app = application.http;
const payload = {
  businessOrderReference: 'merchant-123',
  amountMinor: '1999',
  currency: 'EUR',
};
const checkout = (body = payload) =>
  request(app)
    .post('/checkout-intents')
    .set('Authorization', `Bearer ${configuration.apiKey}`)
    .send(body);
const webhook = (orderId: string, eventId: string, outcome = 'succeeded') =>
  request(app).post('/webhooks/payment').send({ orderId, eventId, outcome });
beforeAll(async () => {
  if (!configuration.databaseUrl.endsWith('/checkout_test'))
    throw new Error('Tests require the dedicated checkout_test database');
  await migrate(pool);
});
beforeEach(async () => {
  await pool.query('TRUNCATE provider_events, orders');
});
afterAll(async () => {
  await pool.end();
});
test('concurrent checkout retries create exactly one immutable order', async () => {
  const responses = await Promise.all(
    Array.from({ length: 20 }, () => checkout()),
  );
  expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
  expect(responses.every((r) => [200, 201].includes(r.status))).toBe(true);
  expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
  expect((await checkout({ ...payload, amountMinor: '2000' })).status).toBe(
    409,
  );
  expect((await checkout({ ...payload, currency: 'USD' })).status).toBe(409);
  const firstResponse = responses[0];
  if (!firstResponse) throw new Error('Expected checkout responses');
  expect(
    (
      await request(app)
        .get(`/orders/${firstResponse.body.id}`)
        .set('Authorization', `Bearer ${configuration.apiKey}`)
    ).body.amountMinor,
  ).toBe('1999');
  expect((await pool.query('SELECT * FROM orders')).rowCount).toBe(1);
});
test('concurrent conflicting checkout payloads have a single winner', async () => {
  const responses = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      checkout({ ...payload, amountMinor: i % 2 ? '1999' : '2000' }),
    ),
  );
  expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
  expect(responses.filter((r) => r.status === 409)).toHaveLength(10);
});
test('duplicate webhook deliveries commit once and acknowledge retries', async () => {
  const { body: order } = await checkout();
  const results = await Promise.all(
    Array.from({ length: 20 }, () => webhook(order.id, 'event-1')),
  );
  expect(results.every((r) => r.status === 200)).toBe(true);
  expect(results.filter((r) => !r.body.duplicate)).toHaveLength(1);
  expect((await pool.query('SELECT * FROM provider_events')).rowCount).toBe(1);
  expect(
    (
      await request(app)
        .get(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${configuration.apiKey}`)
    ).body.status,
  ).toBe('succeeded');
  expect((await webhook(order.id, 'event-1', 'failed')).status).toBe(409);
});
test('conflicting event IDs and out-of-order deliveries always preserve success', async () => {
  const { body: order } = await checkout();
  expect((await webhook(order.id, 'failed-first', 'failed')).status).toBe(200);
  expect(
    (
      await request(app)
        .get(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${configuration.apiKey}`)
    ).body.status,
  ).toBe('failed');
  const results = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      webhook(order.id, `event-${i}`, i % 2 ? 'succeeded' : 'failed'),
    ),
  );
  expect(results.every((r) => r.status === 200)).toBe(true);
  await webhook(order.id, 'late-failure', 'failed');
  expect(
    (
      await request(app)
        .get(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${configuration.apiKey}`)
    ).body.status,
  ).toBe('succeeded');
  expect((await pool.query('SELECT * FROM provider_events')).rowCount).toBe(32);
});
test('changed event order cannot apply to another order', async () => {
  const first = (await checkout()).body;
  const second = (
    await checkout({ ...payload, businessOrderReference: 'second' })
  ).body;
  await webhook(first.id, 'event');
  expect((await webhook(second.id, 'event')).status).toBe(409);
  expect(
    (
      await request(app)
        .get(`/orders/${second.id}`)
        .set('Authorization', `Bearer ${configuration.apiKey}`)
    ).body.status,
  ).toBe('pending');
});
test('concurrent changed event payloads commit only one event', async () => {
  const { body: order } = await checkout();
  const responses = await Promise.all([
    webhook(order.id, 'same', 'failed'),
    webhook(order.id, 'same', 'succeeded'),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const event = (await pool.query('SELECT * FROM provider_events')).rows[0];
  expect(
    (
      await request(app)
        .get(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${configuration.apiKey}`)
    ).body.status,
  ).toBe(event.outcome);
});
test('unknown orders do not consume event IDs', async () => {
  expect((await webhook(randomUUID(), 'retryable')).status).toBe(404);
  expect((await pool.query('SELECT * FROM provider_events')).rowCount).toBe(0);
  const { body: order } = await checkout();
  expect((await webhook(order.id, 'retryable')).status).toBe(200);
});
test('database failure rolls back event insertion and permits identical retry', async () => {
  const { body: order } = await checkout();
  await pool.query(
    `CREATE FUNCTION reject_test_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected failure'; END; $$`,
  );
  await pool.query(
    'CREATE TRIGGER reject_test_update BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION reject_test_update()',
  );
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect((await webhook(order.id, 'retry-after-failure')).status).toBe(503);
    expect((await pool.query('SELECT * FROM provider_events')).rowCount).toBe(
      0,
    );
    expect((await store.get(order.id)).status).toBe('pending');
  } finally {
    await pool.query('DROP TRIGGER reject_test_update ON orders');
    await pool.query('DROP FUNCTION reject_test_update()');
    log.mockRestore();
  }
  expect((await webhook(order.id, 'retry-after-failure')).status).toBe(200);
});
test('public UUIDs map to serial keys and integer foreign keys without leaking internal IDs', async () => {
  const { body: order } = await checkout();
  await webhook(order.id, 'integer-key-event');
  const storedOrder = (await pool.query('SELECT * FROM orders')).rows[0];
  const storedEvent = (await pool.query('SELECT * FROM provider_events'))
    .rows[0];
  expect(typeof storedOrder.id).toBe('number');
  expect(typeof storedEvent.id).toBe('number');
  expect(storedOrder.public_id).toBe(order.id);
  expect(storedEvent.order_id).toBe(storedOrder.id);
  expect(Object.keys(order).sort()).toEqual([
    'amountMinor',
    'businessOrderReference',
    'createdAt',
    'currency',
    'id',
    'status',
    'updatedAt',
  ]);
});

test('application updates timestamps only when the status changes', async () => {
  const { body: order } = await checkout();
  const firstTimestamp = '2000-01-01T00:00:00.000Z';
  await pool.query('UPDATE orders SET updated_at=$1 WHERE public_id=$2', [
    firstTimestamp,
    order.id,
  ]);
  await webhook(order.id, 'failure', 'failed');
  const failed = (
    await request(app)
      .get(`/orders/${order.id}`)
      .set('Authorization', `Bearer ${configuration.apiKey}`)
  ).body;
  expect(failed.status).toBe('failed');
  expect(failed.updatedAt).not.toBe(firstTimestamp);
  await webhook(order.id, 'failure', 'failed');
  await webhook(order.id, 'another-failure', 'failed');
  expect((await store.get(order.id)).updatedAt).toBe(failed.updatedAt);
  await pool.query('UPDATE orders SET updated_at=$1 WHERE public_id=$2', [
    firstTimestamp,
    order.id,
  ]);
  await webhook(order.id, 'success');
  const succeeded = await store.get(order.id);
  expect(succeeded.status).toBe('succeeded');
  expect(succeeded.updatedAt).not.toBe(firstTimestamp);
  await webhook(order.id, 'late-failure', 'failed');
  expect((await store.get(order.id)).updatedAt).toBe(succeeded.updatedAt);
});

test.each(['0', '-1', '1.5', '01', '9223372036854775808', 100])(
  'rejects invalid amount %s',
  async (amountMinor) => {
    expect(
      (
        await request(app)
          .post('/checkout-intents')
          .set('Authorization', `Bearer ${configuration.apiKey}`)
          .send({ ...payload, amountMinor })
      ).status,
    ).toBe(400);
  },
);
test('bigint amounts round-trip exactly', async () => {
  expect(
    (await checkout({ ...payload, amountMinor: '9223372036854775807' })).body
      .amountMinor,
  ).toBe('9223372036854775807');
});
