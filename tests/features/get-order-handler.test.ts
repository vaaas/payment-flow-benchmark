import { CreateCheckoutHandler } from '#src/features/checkout/application/create-checkout-handler';
import { CreateCheckout } from '#src/features/checkout/domain/create-checkout';
import { GetOrderHandler } from '#src/features/orders/application/get-order-handler';
import { GetOrder } from '#src/features/orders/domain/get-order';
import { OrderNotFound } from '#src/features/orders/domain/order-not-found';
import { createInMemoryStores } from '#tests/support/in-memory-stores';

test('an existing order is returned as stored', async () => {
  const stores = createInMemoryStores();
  const { order } = await new CreateCheckoutHandler(stores.checkout).handle(
    CreateCheckout.from({
      businessOrderReference: 'merchant-123',
      amountMinor: '1999',
      currency: 'EUR',
    }),
  );
  const found = await new GetOrderHandler(stores.orders).handle(
    GetOrder.from({ id: order.id }),
  );
  expect(found).toBe(order);
});

test('a missing order is reported as not found', async () => {
  const stores = createInMemoryStores();
  await expect(
    new GetOrderHandler(stores.orders).handle(
      GetOrder.from({ id: '99999999-9999-4999-8999-999999999999' }),
    ),
  ).rejects.toBeInstanceOf(OrderNotFound);
});

test('a lookup never changes the stored order', async () => {
  const stores = createInMemoryStores();
  const handler = new GetOrderHandler(stores.orders);
  const { order } = await new CreateCheckoutHandler(stores.checkout).handle(
    CreateCheckout.from({
      businessOrderReference: 'merchant-123',
      amountMinor: '1999',
      currency: 'EUR',
    }),
  );
  await handler.handle(GetOrder.from({ id: order.id }));
  expect([...stores.data.orders.values()]).toEqual([order]);
});
