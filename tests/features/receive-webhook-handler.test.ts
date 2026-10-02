import { CreateCheckoutHandler } from '#src/features/checkout/application/create-checkout-handler';
import { CreateCheckout } from '#src/features/checkout/domain/create-checkout';
import { OrderNotFound } from '#src/features/orders/domain/order-not-found';
import { ReceiveWebhookHandler } from '#src/features/payments/application/receive-webhook-handler';
import { ProviderEventConflict } from '#src/features/payments/domain/provider-event-conflict';
import type { PaymentStore } from '#src/features/payments/domain/payment-store';
import { ReceiveWebhook } from '#src/features/payments/domain/receive-webhook';
import { createInMemoryStores } from '#tests/support/in-memory-stores';

async function setup() {
  const stores = createInMemoryStores();
  const checkout = new CreateCheckoutHandler(stores.checkout);
  const handler = new ReceiveWebhookHandler(stores.payments);
  const place = async (businessOrderReference = 'merchant-123') =>
    (
      await checkout.handle(
        CreateCheckout.from({
          businessOrderReference,
          amountMinor: '1999',
          currency: 'EUR',
        }),
      )
    ).order;
  const order = await place();
  const receive = (
    eventId: string,
    outcome: string,
    orderId: string = order.id,
  ) => handler.handle(ReceiveWebhook.from({ eventId, orderId, outcome }));
  const status = (id: string = order.id) => stores.data.orders.get(id)?.status;
  return { stores, handler, order, place, receive, status };
}

test('a success event settles a pending order', async () => {
  const { receive, status } = await setup();
  expect(await receive('evt-1', 'succeeded')).toEqual({ duplicate: false });
  expect(status()).toBe('succeeded');
});

test('a failure event fails a pending order', async () => {
  const { receive, status } = await setup();
  await receive('evt-1', 'failed');
  expect(status()).toBe('failed');
});

test('a failed order can later succeed', async () => {
  const { receive, status } = await setup();
  await receive('evt-1', 'failed');
  await receive('evt-2', 'succeeded');
  expect(status()).toBe('succeeded');
});

test('success is final and later failures are stored but ignored', async () => {
  const { stores, receive, status } = await setup();
  await receive('evt-1', 'succeeded');
  expect(await receive('evt-2', 'failed')).toEqual({ duplicate: false });
  expect(status()).toBe('succeeded');
  expect(stores.data.events.size).toBe(2);
});

test.each([
  [['failed', 'failed', 'failed'], 'failed'],
  [['succeeded', 'succeeded'], 'succeeded'],
  [['failed', 'succeeded', 'failed'], 'succeeded'],
  [['failed', 'succeeded', 'failed', 'succeeded', 'failed'], 'succeeded'],
])('events %j end in %s', async (outcomes, expected) => {
  const { stores, receive, status } = await setup();
  for (const [index, outcome] of outcomes.entries())
    await receive(`evt-${index}`, outcome as string);
  expect(status()).toBe(expected);
  expect(stores.data.events.size).toBe(outcomes.length);
});

test('an identical redelivery is acknowledged as a duplicate and applied once', async () => {
  const { stores, receive, order } = await setup();
  await receive('evt-1', 'failed');
  const afterFirst = stores.data.orders.get(order.id);
  expect(await receive('evt-1', 'failed')).toEqual({ duplicate: true });
  expect(stores.data.orders.get(order.id)).toBe(afterFirst);
  expect(stores.data.events.size).toBe(1);
});

test('an old event redelivered after the order moved on changes nothing', async () => {
  const { stores, receive, status, order } = await setup();
  await receive('evt-1', 'failed');
  await receive('evt-2', 'succeeded');
  const settled = stores.data.orders.get(order.id);
  expect(await receive('evt-1', 'failed')).toEqual({ duplicate: true });
  expect(status()).toBe('succeeded');
  expect(stores.data.orders.get(order.id)).toBe(settled);
});

test('the same event ID with another outcome is a conflict and is not applied', async () => {
  const { stores, receive, status } = await setup();
  await receive('evt-1', 'failed');
  await expect(receive('evt-1', 'succeeded')).rejects.toBeInstanceOf(
    ProviderEventConflict,
  );
  expect(status()).toBe('failed');
  expect(stores.data.events.size).toBe(1);
});

test('the same event ID for another order is a conflict and is not applied', async () => {
  const { place, receive, status } = await setup();
  const other = await place('second');
  await receive('evt-1', 'succeeded');
  await expect(receive('evt-1', 'succeeded', other.id)).rejects.toBeInstanceOf(
    ProviderEventConflict,
  );
  expect(status(other.id)).toBe('pending');
});

test('an unknown order is not found and consumes no event ID', async () => {
  const { stores, receive } = await setup();
  const missing = '99999999-9999-4999-8999-999999999999';
  await expect(receive('evt-1', 'succeeded', missing)).rejects.toBeInstanceOf(
    OrderNotFound,
  );
  expect(stores.data.events.size).toBe(0);
});

test('an unknown order is reported before an event ID conflict', async () => {
  const { receive } = await setup();
  await receive('evt-1', 'succeeded');
  await expect(
    receive('evt-1', 'failed', '99999999-9999-4999-8999-999999999999'),
  ).rejects.toBeInstanceOf(OrderNotFound);
});

test('only a status change moves the update timestamp', async () => {
  const { stores, receive, order } = await setup();
  const created = stores.data.orders.get(order.id);
  stores.tick();
  await receive('evt-1', 'failed');
  const failed = stores.data.orders.get(order.id);
  expect(failed?.updatedAt).not.toBe(created?.updatedAt);
  stores.tick();
  await receive('evt-2', 'failed');
  expect(stores.data.orders.get(order.id)).toBe(failed);
  stores.tick();
  await receive('evt-3', 'succeeded');
  const succeeded = stores.data.orders.get(order.id);
  expect(succeeded?.updatedAt).not.toBe(failed?.updatedAt);
  stores.tick();
  await receive('evt-4', 'failed');
  expect(stores.data.orders.get(order.id)).toBe(succeeded);
});

test('a failure while updating the status rolls the event back so a retry can succeed', async () => {
  const { stores, order } = await setup();
  const failing: PaymentStore = {
    transaction: (work) =>
      stores.payments.transaction((session) =>
        work({
          ...session,
          updateStatus: async () => {
            throw new Error('Injected failure');
          },
        }),
      ),
  };
  const event = ReceiveWebhook.from({
    eventId: 'evt-1',
    orderId: order.id,
    outcome: 'succeeded',
  });
  await expect(
    new ReceiveWebhookHandler(failing).handle(event),
  ).rejects.toThrow('Injected failure');
  expect(stores.data.events.size).toBe(0);
  expect(
    await new ReceiveWebhookHandler(stores.payments).handle(event),
  ).toEqual({
    duplicate: false,
  });
});
