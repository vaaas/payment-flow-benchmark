import { HttpStatus } from '#src/shared/response/http-status';
import { Timestamp } from '#src/shared/domain/timestamp';
import { Amount } from '#src/shared/domain/amount';
import { BusinessOrderReference } from '#src/features/checkout/domain/business-order-reference';
import { OrderId } from '#src/features/orders/domain/order-id';
import { Currency } from '#src/shared/domain/currency';
import { Configuration } from '#src/configuration/configuration';
import { installFeatures } from '#src/bootstrap/install-features';
import { Container } from '#src/application/dependency-injection/container';
import type {
  ErrorResponse,
  IRespondable,
} from '#src/shared/response/i-respondable';
import request from 'supertest';
import { App } from '#src/http/app';
import { Bus } from '#src/application/bus';
import { createStoreFakes } from '#tests/support/store-fakes';
import { Order } from '#src/features/orders/domain/order';
import { CreateCheckout } from '#src/features/checkout/domain/create-checkout';
import { ReceiveWebhook } from '#src/features/payments/domain/receive-webhook';
import { GetOrder } from '#src/features/orders/domain/get-order';
const stores = createStoreFakes();
const configuration = Configuration.fromEnv({
  DATABASE_URL: 'postgresql://postgres:benchmark@database:5432/checkout_test',
});
const container = new Container()
  .registerInstance(Configuration, configuration)
  .install(stores.install);
const bus = container.get(Bus);
const application = container.get(App).install(installFeatures);
const app = application.http;
beforeEach(() => jest.resetAllMocks());
afterEach(() => jest.restoreAllMocks());
test('invalid JSON and unknown fields never reach persistence', async () => {
  expect(
    (
      await request(app)
        .post('/checkout-intents')
        .set('Authorization', `Bearer ${configuration.apiKey}`)
        .set('Content-Type', 'application/json')
        .send('{')
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .post('/checkout-intents')
        .set('Authorization', `Bearer ${configuration.apiKey}`)
        .send({
          businessOrderReference: 'x',
          amountMinor: '1',
          currency: 'EUR',
          extra: true,
        })
    ).status,
  ).toBe(400);
  expect(stores.checkout.transaction).not.toHaveBeenCalled();
});
test('unknown order and malformed UUID produce distinct responses', async () => {
  stores.orders.find.mockResolvedValue(undefined);
  expect(
    (
      await request(app)
        .get('/orders/11111111-1111-4111-8111-111111111111')
        .set('Authorization', `Bearer ${configuration.apiKey}`)
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .get('/orders/bad')
        .set('Authorization', `Bearer ${configuration.apiKey}`)
    ).status,
  ).toBe(400);
});
test('webhook acknowledgement waits for persistence completion', async () => {
  let complete!: (value: { duplicate: boolean }) => void;
  stores.payments.transaction.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const response = request(app)
    .post('/webhooks/payment')
    .send({
      eventId: 'e',
      orderId: '11111111-1111-4111-8111-111111111111',
      outcome: 'failed',
    })
    .then((result) => result);
  while (!stores.payments.transaction.mock.calls.length)
    await new Promise((resolve) => setTimeout(resolve, 5));
  complete({ duplicate: false });
  expect((await response).status).toBe(200);
});

const checkoutPayload = {
  businessOrderReference: 'merchant-123',
  amountMinor: '1999',
  currency: 'EUR',
};
const order = new Order({
  ...checkoutPayload,
  currency: Currency.of(checkoutPayload.currency),
  amountMinor: Amount.of(1999n),
  businessOrderReference: BusinessOrderReference.parse(
    checkoutPayload.businessOrderReference,
  ),
  id: OrderId.parse('11111111-1111-4111-8111-111111111111'),
  status: 'pending',
  createdAt: Timestamp.of(new Date('2026-10-01T10:00:00.000Z')),
  updatedAt: Timestamp.of(new Date('2026-10-01T10:00:00.000Z')),
});

test('checkout route dispatches a parsed immutable domain command', async () => {
  stores.checkout.transaction.mockResolvedValue({ order, created: true });
  const dispatch = jest.spyOn(bus, 'dispatch');
  const response = await request(app)
    .post('/checkout-intents')
    .set('Authorization', `Bearer ${configuration.apiKey}`)
    .send(checkoutPayload);

  expect(response.status).toBe(201);
  expect(response.body).toEqual(JSON.parse(JSON.stringify(order)));
  expect(dispatch).toHaveBeenCalledWith(expect.any(CreateCheckout));
  const command = dispatch.mock.calls[0]?.[0];
  if (!(command instanceof CreateCheckout))
    throw new Error('Expected CreateCheckout');
  expect(command.payload).toEqual({
    ...checkoutPayload,
    currency: Currency.of(checkoutPayload.currency),
    amountMinor: Amount.of(1999n),
  });
  expect(stores.checkout.transaction).toHaveBeenCalledTimes(1);
  expect(Object.isFrozen(command)).toBe(true);
  expect(Object.isFrozen(command.payload)).toBe(true);
});

test('webhook route dispatches a parsed immutable domain command', async () => {
  const payload = { eventId: 'event-1', orderId: order.id, outcome: 'failed' };
  stores.payments.transaction.mockResolvedValue({ duplicate: false });
  const dispatch = jest.spyOn(bus, 'dispatch');
  const response = await request(app).post('/webhooks/payment').send(payload);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ duplicate: false });
  expect(dispatch).toHaveBeenCalledWith(expect.any(ReceiveWebhook));
  const command = dispatch.mock.calls[0]?.[0];
  if (!(command instanceof ReceiveWebhook))
    throw new Error('Expected ReceiveWebhook');
  expect(command.payload).toEqual(payload);
  expect(Object.isFrozen(command)).toBe(true);
  expect(Object.isFrozen(command.payload)).toBe(true);
});

test('order route dispatches a parsed immutable domain query', async () => {
  stores.orders.find.mockResolvedValue(order);
  const dispatch = jest.spyOn(bus, 'dispatch');
  const response = await request(app)
    .get(`/orders/${order.id}`)
    .set('Authorization', `Bearer ${configuration.apiKey}`);

  expect(response.status).toBe(200);
  expect(response.body).toEqual(JSON.parse(JSON.stringify(order)));
  expect(dispatch).toHaveBeenCalledWith(expect.any(GetOrder));
  const query = dispatch.mock.calls[0]?.[0];
  if (!(query instanceof GetOrder)) throw new Error('Expected GetOrder');
  expect(query.id).toBe(order.id);
  expect(Object.isFrozen(query)).toBe(true);
});

test.each([
  { outcome: 'pending' },
  { orderId: 'invalid' },
  { eventId: ' event-1' },
  { extra: true },
])(
  'webhook route rejects invalid input before dispatch: %j',
  async (invalid) => {
    const response = await request(app)
      .post('/webhooks/payment')
      .send({
        eventId: 'event-1',
        orderId: order.id,
        outcome: 'failed',
        ...invalid,
      });

    expect(response.status).toBe(400);
    expect(stores.payments.transaction).not.toHaveBeenCalled();
  },
);

test('App serves its OpenAPI route and handles unmatched routes', async () => {
  const spec = await request(app).get('/openapi.json');
  expect(spec.status).toBe(200);
  expect(spec.body.paths['/checkout-intents'].post.operationId).toBe(
    'createCheckoutIntent',
  );
  expect((await request(app).get('/unknown')).body).toEqual({
    error: 'Route not found',
  });
});

test('middleware accepts an unknown error implementing IRespondable', async () => {
  class RateLimited extends Error implements IRespondable {
    response(): ErrorResponse {
      return {
        status: HttpStatus.tooManyRequests,
        body: { error: 'Try again later', details: { retryAfter: 5 } },
      };
    }
  }
  stores.orders.find.mockRejectedValue(new RateLimited());
  const response = await request(app)
    .get(`/orders/${order.id}`)
    .set('Authorization', `Bearer ${configuration.apiKey}`);
  expect(response.status).toBe(429);
  expect(response.body).toEqual({
    error: 'Try again later',
    details: { retryAfter: 5 },
  });
});

test.each([
  new Error('private database failure'),
  { response: 'not a method' },
])(
  'middleware handles non-respondable errors without leaking details: %s',
  async (error) => {
    stores.orders.find.mockRejectedValue(error);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request(app)
      .get(`/orders/${order.id}`)
      .set('Authorization', `Bearer ${configuration.apiKey}`);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: 'Processing failed; retry the identical request',
    });
    expect(log).toHaveBeenCalledWith(error);
  },
);

test.each(['iso-8859-1', 'unsupported'])(
  'unsupported JSON charset remains a client error: %s',
  async (charset) => {
    const response = await request(app)
      .post('/checkout-intents')
      .set('Authorization', `Bearer ${configuration.apiKey}`)
      .set('Content-Type', `application/json; charset=${charset}`)
      .send(JSON.stringify(checkoutPayload));
    expect(response.status).toBe(415);
    expect(response.body.error).toBe('Invalid JSON body');
    expect(stores.checkout.transaction).not.toHaveBeenCalled();
  },
);

test('unsupported content encoding remains a client error', async () => {
  const response = await request(app)
    .post('/checkout-intents')
    .set('Authorization', `Bearer ${configuration.apiKey}`)
    .set('Content-Encoding', 'unsupported')
    .send(checkoutPayload);
  expect(response.status).toBe(415);
  expect(stores.checkout.transaction).not.toHaveBeenCalled();
});

test.each(['a\u0000b', '\ud800', '\udc00'])(
  'invalid PostgreSQL identifiers are rejected before checkout and webhook persistence: %j',
  async (identifier) => {
    const checkout = await request(app)
      .post('/checkout-intents')
      .set('Authorization', `Bearer ${configuration.apiKey}`)
      .send({ ...checkoutPayload, businessOrderReference: identifier });
    const webhook = await request(app)
      .post('/webhooks/payment')
      .send({ eventId: identifier, orderId: order.id, outcome: 'succeeded' });
    expect(checkout.status).toBe(400);
    expect(webhook.status).toBe(400);
    expect(stores.checkout.transaction).not.toHaveBeenCalled();
    expect(stores.payments.transaction).not.toHaveBeenCalled();
  },
);
