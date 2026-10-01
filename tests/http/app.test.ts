import request from 'supertest';
import { App } from '../../src/http/app';
import { CommandBus } from '../../src/application/command-bus';
import { QueryBus } from '../../src/application/query-bus';
import type { OrderStore } from '../../src/orders/domain/order-store';
import { OrderNotFound } from '../../src/orders/domain/order-not-found';
import { Order } from '../../src/orders/domain/order';
import { CreateCheckout } from '../../src/checkout/domain/create-checkout';
import { ReceiveWebhook } from '../../src/payments/domain/receive-webhook';
import { GetOrder } from '../../src/orders/domain/get-order';
const store: jest.Mocked<OrderStore> = {
  create: jest.fn(),
  receive: jest.fn(),
  get: jest.fn(),
};
const commands = new CommandBus(store);
const queries = new QueryBus(store);
const app = new App(commands, queries).http;
beforeEach(() => jest.resetAllMocks());
afterEach(() => jest.restoreAllMocks());
test('invalid JSON and unknown fields never reach persistence', async () => {
  expect(
    (
      await request(app)
        .post('/checkout-intents')
        .set('Content-Type', 'application/json')
        .send('{')
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app).post('/checkout-intents').send({
        businessOrderReference: 'x',
        amountMinor: '1',
        currency: 'EUR',
        extra: true,
      })
    ).status,
  ).toBe(400);
  expect(store.create).not.toHaveBeenCalled();
});
test('unknown order and malformed UUID produce distinct responses', async () => {
  store.get.mockRejectedValue(new OrderNotFound());
  expect(
    (await request(app).get('/orders/11111111-1111-4111-8111-111111111111'))
      .status,
  ).toBe(404);
  expect((await request(app).get('/orders/bad')).status).toBe(400);
});
test('webhook acknowledgement waits for persistence completion', async () => {
  let complete!: (value: { duplicate: boolean }) => void;
  store.receive.mockReturnValue(
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
  while (!store.receive.mock.calls.length)
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
  id: '11111111-1111-4111-8111-111111111111',
  status: 'pending',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
});

test('checkout route dispatches a parsed immutable domain command', async () => {
  store.create.mockResolvedValue({ order, created: true });
  const dispatch = jest.spyOn(commands, 'dispatch');
  const response = await request(app)
    .post('/checkout-intents')
    .send(checkoutPayload);

  expect(response.status).toBe(201);
  expect(response.body).toEqual({ ...order });
  expect(dispatch).toHaveBeenCalledWith(expect.any(CreateCheckout));
  const command = dispatch.mock.calls[0][0];
  expect(command.payload).toEqual(checkoutPayload);
  expect(Object.isFrozen(command)).toBe(true);
  expect(Object.isFrozen(command.payload)).toBe(true);
});

test('webhook route dispatches a parsed immutable domain command', async () => {
  const payload = { eventId: 'event-1', orderId: order.id, outcome: 'failed' };
  store.receive.mockResolvedValue({ duplicate: false });
  const dispatch = jest.spyOn(commands, 'dispatch');
  const response = await request(app).post('/webhooks/payment').send(payload);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ duplicate: false });
  expect(dispatch).toHaveBeenCalledWith(expect.any(ReceiveWebhook));
  const command = dispatch.mock.calls[0][0];
  expect(command.payload).toEqual(payload);
  expect(Object.isFrozen(command)).toBe(true);
  expect(Object.isFrozen(command.payload)).toBe(true);
});

test('order route dispatches a parsed immutable domain query', async () => {
  store.get.mockResolvedValue(order);
  const dispatch = jest.spyOn(queries, 'dispatch');
  const response = await request(app).get(`/orders/${order.id}`);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ...order });
  expect(dispatch).toHaveBeenCalledWith(expect.any(GetOrder));
  expect(dispatch.mock.calls[0][0].id).toBe(order.id);
  expect(Object.isFrozen(dispatch.mock.calls[0][0])).toBe(true);
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
    expect(store.receive).not.toHaveBeenCalled();
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
