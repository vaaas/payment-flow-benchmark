import { Currency } from '#src/shared/domain/currency';
import request from 'supertest';
import { Container } from '#src/application/dependency-injection/container';
import { installFeatures } from '#src/bootstrap/install-features';
import { Configuration } from '#src/configuration/configuration';
import { Order } from '#src/features/orders/domain/order';
import { OrderStore } from '#src/features/orders/domain/order-store';
import { App } from '#src/http/app';

const payload = {
  businessOrderReference: 'private-order',
  amountMinor: '1999',
  currency: 'EUR',
};
const order = new Order({
  ...payload,
  currency: Currency.of(payload.currency),
  id: '11111111-1111-4111-8111-111111111111',
  status: 'pending',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
});
const configuration = Configuration.fromEnv({
  DATABASE_URL: 'postgresql://postgres:benchmark@database:5432/checkout_test',
  API_KEY: 'sample-private-key',
});
const store: jest.Mocked<OrderStore> = {
  create: jest.fn(),
  get: jest.fn(),
  receive: jest.fn(),
};
const container = new Container()
  .registerInstance(Configuration, configuration)
  .registerInstance(OrderStore, store);
const app = container.get(App).install(installFeatures).http;
beforeEach(() => jest.resetAllMocks());

test.each([
  undefined,
  'Basic sample-private-key',
  'Bearer',
  'Bearer incorrect-key',
  'Bearer benchmark-api-key',
])(
  'private routes reject invalid credentials before persistence: %s',
  async (authorization) => {
    const checkout = request(app).post('/checkout-intents').send(payload);
    const lookup = request(app).get(`/orders/${order.id}`);
    if (authorization !== undefined) {
      checkout.set('Authorization', authorization);
      lookup.set('Authorization', authorization);
    }
    for (const response of await Promise.all([checkout, lookup])) {
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.body).toEqual({
        error: 'Invalid or missing bearer API key',
      });
    }
    expect(store.create).not.toHaveBeenCalled();
    expect(store.get).not.toHaveBeenCalled();
  },
);

test.each(['Bearer', 'bearer'])(
  'private routes accept the configured key with scheme %s',
  async (scheme) => {
    store.create.mockResolvedValue({ order, created: true });
    store.get.mockResolvedValue(order);
    const authorization = `${scheme} ${configuration.apiKey}`;
    expect(
      (
        await request(app)
          .post('/checkout-intents')
          .set('Authorization', authorization)
          .send(payload)
      ).status,
    ).toBe(201);
    const response = await request(app)
      .get(`/orders/${order.id}`)
      .set('Authorization', authorization);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(order.id);
  },
);

test('provider webhooks and OpenAPI remain public with private-route security documented', async () => {
  store.receive.mockResolvedValue({ duplicate: false });
  expect(
    (
      await request(app).post('/webhooks/payment').send({
        eventId: 'public-provider-event',
        orderId: order.id,
        outcome: 'succeeded',
      })
    ).status,
  ).toBe(200);
  expect(store.receive).toHaveBeenCalledTimes(1);
  const specification = await request(app).get('/openapi.json');
  expect(specification.status).toBe(200);
  expect(specification.body.security).toEqual([]);
  expect(specification.body.paths['/checkout-intents'].post.security).toEqual([
    { BearerApiKey: [] },
  ]);
  expect(specification.body.paths['/orders/{id}'].get.security).toEqual([
    { BearerApiKey: [] },
  ]);
  expect(
    specification.body.paths['/webhooks/payment'].post.security,
  ).toBeUndefined();
});
