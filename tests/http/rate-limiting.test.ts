import request from 'supertest';
import { Container } from '#src/application/dependency-injection/container';
import { installFeatures } from '#src/bootstrap/install-features';
import { Configuration } from '#src/configuration/configuration';
import { CheckoutConflict } from '#src/features/checkout/domain/checkout-conflict';
import { Order } from '#src/features/orders/domain/order';
import { OrderStore } from '#src/features/orders/domain/order-store';
import { App } from '#src/http/app';
import { RateLimiter } from '#src/http/rate-limiting/rate-limiter';

const payload = {
  businessOrderReference: 'limited-order',
  amountMinor: '1999',
  currency: 'EUR',
};
const order = new Order({
  ...payload,
  id: '11111111-1111-4111-8111-111111111111',
  status: 'pending',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
});

function fixture() {
  let now = 0;
  const configuration = Configuration.fromEnv({
    DATABASE_URL: 'postgresql://postgres:benchmark@database:5432/checkout_test',
    RATE_LIMIT_MAX: '2',
    RATE_LIMIT_WINDOW_MS: '2500',
  });
  const store: jest.Mocked<OrderStore> = {
    create: jest.fn().mockResolvedValue({ order, created: true }),
    get: jest.fn().mockResolvedValue(order),
    receive: jest.fn().mockResolvedValue({ duplicate: false }),
  };
  const container = new Container()
    .registerInstance(Configuration, configuration)
    .registerInstance(OrderStore, store)
    .registerInstance(RateLimiter, new RateLimiter(configuration, () => now));
  const app = container.get(App).install(installFeatures).http;
  const authorization = `Bearer ${configuration.apiKey}`;
  return {
    app,
    store,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    checkout: () =>
      request(app)
        .post('/checkout-intents')
        .set('Authorization', authorization)
        .send(payload),
    lookup: () =>
      request(app)
        .get(`/orders/${order.id}`)
        .set('Authorization', authorization),
  };
}

test('private routes share a budget and rejected requests never reach persistence', async () => {
  const { checkout, lookup, store } = fixture();
  expect((await checkout()).status).toBe(201);
  expect((await lookup()).status).toBe(200);
  for (const response of await Promise.all([checkout(), lookup()])) {
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('3');
    expect(response.body).toEqual({ error: 'Too many requests; retry later' });
  }
  expect(store.create).toHaveBeenCalledTimes(1);
  expect(store.get).toHaveBeenCalledTimes(1);
});

test('rejected requests do not extend the window and the budget resets at its boundary', async () => {
  const { lookup, advance } = fixture();
  await lookup();
  await lookup();
  advance(1000);
  expect((await lookup()).headers['retry-after']).toBe('2');
  advance(1499);
  expect((await lookup()).headers['retry-after']).toBe('1');
  advance(1);
  expect((await lookup()).status).toBe(200);
  expect((await lookup()).status).toBe(200);
  expect((await lookup()).status).toBe(429);
});

test('a concurrent burst cannot exceed the private-route budget', async () => {
  const { checkout, store } = fixture();
  const responses = await Promise.all(
    Array.from({ length: 20 }, () =>
      checkout().set('Idempotency-Key', 'repeated-submit'),
    ),
  );
  expect(responses.filter((response) => response.status === 201)).toHaveLength(
    2,
  );
  expect(responses.filter((response) => response.status === 429)).toHaveLength(
    18,
  );
  expect(store.create).toHaveBeenCalledTimes(2);
});

test('failed authentication does not consume the shared authenticated budget', async () => {
  const { app, checkout, lookup } = fixture();
  const responses = await Promise.all(
    Array.from({ length: 5 }, () => request(app).get(`/orders/${order.id}`)),
  );
  expect(responses.every((response) => response.status === 401)).toBe(true);
  expect((await checkout()).status).toBe(201);
  expect((await lookup()).status).toBe(200);
  expect((await lookup()).status).toBe(429);
});

test('processing failures count toward the request limit', async () => {
  const { checkout, lookup, store } = fixture();
  store.create.mockRejectedValueOnce(new CheckoutConflict());
  expect((await checkout()).status).toBe(409);
  expect((await lookup()).status).toBe(200);
  expect((await lookup()).status).toBe(429);
});

test('provider retries and OpenAPI remain available after private capacity is exhausted', async () => {
  const { app, lookup, store } = fixture();
  await lookup();
  await lookup();
  expect((await lookup()).status).toBe(429);
  expect(
    (
      await request(app).post('/webhooks/payment').send({
        eventId: 'provider-retry',
        orderId: order.id,
        outcome: 'succeeded',
      })
    ).status,
  ).toBe(200);
  const spec = await request(app).get('/openapi.json');
  expect(spec.status).toBe(200);
  expect(
    spec.body.paths['/checkout-intents'].post.responses['429'].headers[
      'Retry-After'
    ],
  ).toBeDefined();
  expect(store.receive).toHaveBeenCalledTimes(1);
});
