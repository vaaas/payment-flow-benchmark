import request from 'supertest';
import { App } from '../../src/http/app';
import { CommandBus } from '../../src/application/command-bus';
import { QueryBus } from '../../src/application/query-bus';
import type { OrderStore } from '../../src/orders/domain/order-store';
import { OrderNotFound } from '../../src/orders/domain/order-not-found';
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

