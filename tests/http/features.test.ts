import { Timestamp } from '#src/shared/domain/timestamp';
import { Amount } from '#src/shared/domain/amount';
import { BusinessOrderReference } from '#src/features/checkout/domain/business-order-reference';
import { OrderId } from '#src/features/orders/domain/order-id';
import { Currency } from '#src/shared/domain/currency';
import { Configuration } from '#src/configuration/configuration';
import request from 'supertest';
import { Bus } from '#src/application/bus';
import { Container } from '#src/application/dependency-injection/container';
import { installCheckoutFeature } from '#src/features/checkout/install-checkout-feature';
import { GetOrder } from '#src/features/orders/domain/get-order';
import { Order } from '#src/features/orders/domain/order';
import { createStoreFakes } from '#tests/support/store-fakes';
import { App } from '#src/http/app';

test('one feature installation wires its dependencies, events and routes without installing other features', async () => {
  const payload = {
    businessOrderReference: 'feature-order',
    amountMinor: '1999',
    currency: 'EUR',
  };
  const order = new Order({
    ...payload,
    currency: Currency.of(payload.currency),
    amountMinor: Amount.of(1999n),
    businessOrderReference: BusinessOrderReference.parse(
      payload.businessOrderReference,
    ),
    id: OrderId.parse('11111111-1111-4111-8111-111111111111'),
    status: 'pending',
    createdAt: Timestamp.of(new Date('2026-10-01T10:00:00.000Z')),
    updatedAt: Timestamp.of(new Date('2026-10-01T10:00:00.000Z')),
  });
  const stores = createStoreFakes();
  stores.checkout.transaction.mockResolvedValue({ order, created: true });
  const configuration = Configuration.fromEnv({
    DATABASE_URL: 'postgresql://postgres:benchmark@database:5432/checkout_test',
  });
  const container = new Container()
    .registerInstance(Configuration, configuration)
    .install(stores.install);
  const app = container.get(App);
  expect(
    (
      await request(app.http)
        .post('/checkout-intents')
        .set('Authorization', `Bearer ${configuration.apiKey}`)
        .send(payload)
    ).status,
  ).toBe(404);
  expect(app.install(installCheckoutFeature)).toBe(app);
  const response = await request(app.http)
    .post('/checkout-intents')
    .set('Authorization', `Bearer ${configuration.apiKey}`)
    .send(payload);
  expect(response.status).toBe(201);
  expect(response.body.id).toBe(order.id);
  expect(stores.checkout.transaction).toHaveBeenCalledTimes(1);
  expect(
    (
      await request(app.http)
        .get(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${configuration.apiKey}`)
    ).status,
  ).toBe(404);
  expect(
    (await request(app.http).post('/webhooks/payment').send({})).status,
  ).toBe(404);
  await expect(
    container.get(Bus).dispatch(GetOrder.from({ id: order.id })),
  ).rejects.toThrow('No handler registered for GetOrder');
  expect(stores.orders.find).not.toHaveBeenCalled();
  expect(stores.payments.transaction).not.toHaveBeenCalled();
});
