import request from 'supertest';
import { Bus } from '#src/application/bus';
import { Container } from '#src/application/dependency-injection/container';
import { installCheckoutFeature } from '#src/features/checkout/install-checkout-feature';
import { GetOrder } from '#src/features/orders/domain/get-order';
import { Order } from '#src/features/orders/domain/order';
import { OrderStore } from '#src/features/orders/domain/order-store';
import { App } from '#src/http/app';

test('one feature installation wires its dependencies, events and routes without installing other features', async () => {
  const payload = {
    businessOrderReference: 'feature-order',
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
  const store: jest.Mocked<OrderStore> = {
    create: jest.fn().mockResolvedValue({ order, created: true }),
    receive: jest.fn(),
    get: jest.fn(),
  };
  const container = new Container().registerInstance(OrderStore, store);
  const app = container.get(App);
  expect(
    (await request(app.http).post('/checkout-intents').send(payload)).status,
  ).toBe(404);
  expect(app.install(installCheckoutFeature)).toBe(app);
  const response = await request(app.http)
    .post('/checkout-intents')
    .send(payload);
  expect(response.status).toBe(201);
  expect(response.body.id).toBe(order.id);
  expect(store.create).toHaveBeenCalledWith(payload);
  expect((await request(app.http).get(`/orders/${order.id}`)).status).toBe(404);
  expect(
    (await request(app.http).post('/webhooks/payment').send({})).status,
  ).toBe(404);
  await expect(
    container.get(Bus).dispatch(GetOrder.from({ id: order.id })),
  ).rejects.toThrow('No handler registered for GetOrder');
  expect(store.get).not.toHaveBeenCalled();
  expect(store.receive).not.toHaveBeenCalled();
});
