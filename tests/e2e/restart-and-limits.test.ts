import { connect } from 'node:net';
import request from 'supertest';
import { Milliseconds } from '#src/shared/domain/milliseconds';
import { createFixture, validCheckout } from '#tests/support/e2e-fixture';
import type { Fixture } from '#tests/support/e2e-fixture';

const openFixtures: Fixture[] = [];
const open = (options: Parameters<typeof createFixture>[0] = {}) => {
  const fixture = createFixture(options);
  openFixtures.push(fixture);
  return fixture;
};

const primary = open();

beforeAll(primary.prepare);
beforeEach(primary.reset);
afterAll(async () => {
  await Promise.all(openFixtures.map((fixture) => fixture.close()));
});

test('orders, keys and events survive a service restart', async () => {
  const before = open();
  const created = await before.checkout().set('Idempotency-Key', 'durable');
  await before.webhook(created.body.id, 'durable-event', 'failed');
  await before.close();

  const after = open();
  const read = await after.order(created.body.id);
  expect(read.status).toBe(200);
  expect(read.body).toMatchObject({ id: created.body.id, status: 'failed' });
  const replay = await after.checkout().set('Idempotency-Key', 'durable');
  expect(replay.status).toBe(200);
  expect(replay.body.id).toBe(created.body.id);
  const redelivery = await after.webhook(
    created.body.id,
    'durable-event',
    'failed',
  );
  expect(redelivery.body).toEqual({ duplicate: true });
  const conflict = await after.webhook(
    created.body.id,
    'durable-event',
    'succeeded',
  );
  expect(conflict.status).toBe(409);
});

test('two service instances sharing a database agree on every order', async () => {
  const second = open();
  const created = await primary.checkout();
  const duplicate = await second.checkout();
  expect(duplicate.status).toBe(200);
  expect(duplicate.body).toEqual(created.body);
  await second.webhook(created.body.id, 'from-second');
  expect((await primary.order(created.body.id)).body.status).toBe('succeeded');
  expect(await primary.webhook(created.body.id, 'from-second')).toMatchObject({
    body: { duplicate: true },
  });
});

test('concurrent submissions across two service instances still yield one order', async () => {
  const second = open();
  const responses = await Promise.all(
    Array.from({ length: 30 }, (_, index) =>
      (index % 2 === 0 ? primary : second)
        .checkout()
        .set('Idempotency-Key', `cross-instance-${index % 3}`),
    ),
  );
  expect(responses.filter((response) => response.status === 201)).toHaveLength(
    1,
  );
  expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
  expect(await primary.count('orders')).toBe(1);
});

test('the rate limit budget is per process and resets on restart', async () => {
  const limited = open({ rateLimitMax: 2 });
  const order = await limited.place();
  expect((await limited.order(order.id)).status).toBe(200);
  expect((await limited.order(order.id)).status).toBe(429);

  const restarted = open({ rateLimitMax: 2 });
  expect((await restarted.order(order.id)).status).toBe(200);
  expect((await restarted.order(order.id)).status).toBe(200);
  expect((await restarted.order(order.id)).status).toBe(429);
});

test('requests rejected by the rate limit never reach the database', async () => {
  let now = 0;
  const limited = open({
    rateLimitMax: 2,
    rateLimitWindowMs: 10000,
    now: () => Milliseconds.parse(now),
  });
  await limited.place('allowed-1');
  await limited.place('allowed-2');
  const rejected = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      limited.checkout({
        ...validCheckout,
        businessOrderReference: `rejected-${index}`,
      }),
    ),
  );
  expect(rejected.every((response) => response.status === 429)).toBe(true);
  expect(await limited.count('orders')).toBe(2);
  now += 10000;
  const afterWindow = await limited.checkout({
    ...validCheckout,
    businessOrderReference: 'after-window',
  });
  expect(afterWindow.status).toBe(201);
  expect(await limited.count('orders')).toBe(3);
});

test('Retry-After counts down as the window elapses', async () => {
  let now = 0;
  const limited = open({
    rateLimitMax: 1,
    rateLimitWindowMs: 10000,
    now: () => Milliseconds.parse(now),
  });
  await limited.place();
  const early = await limited.order('00000000-0000-4000-8000-000000000000');
  now += 7500;
  const later = await limited.order('00000000-0000-4000-8000-000000000000');
  expect(early.headers['retry-after']).toBe('10');
  expect(later.headers['retry-after']).toBe('3');
});

test('provider webhooks keep committing while private capacity is exhausted', async () => {
  const limited = open({ rateLimitMax: 1 });
  const order = await limited.place();
  expect((await limited.order(order.id)).status).toBe(429);
  const paid = await limited.webhook(order.id, 'during-limit');
  expect(paid.status).toBe(200);
  expect(await limited.count('provider_events')).toBe(1);
  const spec = await request(limited.app).get('/openapi.json');
  expect(spec.status).toBe(200);
});

test('retrying a rejected submission after the window creates it exactly once', async () => {
  let now = 0;
  const limited = open({
    rateLimitMax: 1,
    rateLimitWindowMs: 1000,
    now: () => Milliseconds.parse(now),
  });
  await limited.place('filler');
  const rejected = await limited.checkout().set('Idempotency-Key', 'retry-me');
  expect(rejected.status).toBe(429);
  now += 1000;
  const first = await limited.checkout().set('Idempotency-Key', 'retry-me');
  expect(first.status).toBe(201);
  now += 1000;
  const replay = await limited.checkout().set('Idempotency-Key', 'retry-me');
  expect(replay.status).toBe(200);
  expect(replay.body.id).toBe(first.body.id);
  expect(await limited.count('orders')).toBe(2);
});

test('the service handles a full flow over a real socket and shuts down cleanly', async () => {
  const server = await primary.serve();
  const headers = {
    Authorization: primary.authorization,
    'Content-Type': 'application/json',
  };
  const created = await fetch(`${server.url}/checkout-intents`, {
    method: 'POST',
    headers,
    body: JSON.stringify(validCheckout),
  });
  const order = await created.json();
  const paid = await fetch(`${server.url}/webhooks/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId: 'socket-event',
      orderId: order.id,
      outcome: 'succeeded',
    }),
  });
  const read = await fetch(`${server.url}/orders/${order.id}`, { headers });
  expect(created.status).toBe(201);
  expect(await paid.json()).toEqual({ duplicate: false });
  expect((await read.json()).status).toBe('succeeded');
  await server.stop();
  await expect(fetch(`${server.url}/openapi.json`)).rejects.toThrow();
});

test('a client that disconnects mid-request leaves no partial order and the service keeps serving', async () => {
  const server = await primary.serve();
  try {
    await new Promise<void>((resolve) => {
      const socket = connect(
        Number(new URL(server.url).port),
        '127.0.0.1',
        () => {
          socket.write(
            `POST /checkout-intents HTTP/1.1\r\nHost: localhost\r\nAuthorization: ${primary.authorization}\r\nContent-Type: application/json\r\nContent-Length: 200\r\n\r\n{"businessOrderRef`,
          );
          setTimeout(() => socket.destroy(), 50);
        },
      );
      socket.on('error', () => undefined);
      socket.on('close', () => resolve());
    });
    expect(await primary.count('orders')).toBe(0);
    const response = await fetch(`${server.url}/checkout-intents`, {
      method: 'POST',
      headers: {
        Authorization: primary.authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validCheckout),
    });
    expect(response.status).toBe(201);
  } finally {
    await server.stop();
  }
});
