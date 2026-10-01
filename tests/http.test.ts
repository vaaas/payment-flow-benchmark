import request from 'supertest';
import { createApp } from '../src/app';
import { CommandBus, HttpError, OrderStore, QueryBus } from '../src/domain';
const store: jest.Mocked<OrderStore> = { create: jest.fn(), receive: jest.fn(), get: jest.fn() };
const app = createApp(new CommandBus(store), new QueryBus(store));
beforeEach(() => jest.resetAllMocks());
test('invalid JSON and unknown fields never reach persistence', async () => {
  expect((await request(app).post('/checkout-intents').set('Content-Type', 'application/json').send('{')).status).toBe(400);
  expect((await request(app).post('/checkout-intents').send({ businessOrderReference: 'x', amountMinor: '1', currency: 'EUR', extra: true })).status).toBe(400);
  expect(store.create).not.toHaveBeenCalled();
});
test('unknown order and malformed UUID produce distinct responses', async () => {
  store.get.mockRejectedValue(new HttpError(404, 'Order not found'));
  expect((await request(app).get('/orders/11111111-1111-4111-8111-111111111111')).status).toBe(404);
  expect((await request(app).get('/orders/bad')).status).toBe(400);
});
test('webhook acknowledgement waits for persistence completion', async () => {
  let complete!: (value: { duplicate: boolean }) => void;
  store.receive.mockReturnValue(new Promise(resolve => { complete = resolve; }));
  const response = request(app).post('/webhooks/payment').send({ eventId: 'e', orderId: '11111111-1111-4111-8111-111111111111', outcome: 'failed' }).then(result => result);
  while (!store.receive.mock.calls.length) await new Promise(resolve => setTimeout(resolve, 5));
  complete({ duplicate: false });
  expect((await response).status).toBe(200);
});
