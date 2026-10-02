import { Amount } from '#src/shared/domain/amount';
import { CreateCheckoutHandler } from '#src/features/checkout/application/create-checkout-handler';
import { CheckoutConflict } from '#src/features/checkout/domain/checkout-conflict';
import { CreateCheckout } from '#src/features/checkout/domain/create-checkout';
import type { CheckoutStore } from '#src/features/checkout/domain/checkout-store';
import { createInMemoryStores } from '#tests/support/in-memory-stores';

const body = {
  businessOrderReference: 'merchant-123',
  amountMinor: '1999',
  currency: 'EUR',
};

function setup() {
  const stores = createInMemoryStores();
  const handler = new CreateCheckoutHandler(
    stores.checkout,
    stores.ids,
    stores.clock,
  );
  const submit = (override: object = {}) =>
    handler.handle(CreateCheckout.from({ ...body, ...override }));
  return { stores, handler, submit };
}

test('a new checkout creates a pending order', async () => {
  const { stores, submit } = setup();
  const result = await submit();
  expect(result.created).toBe(true);
  expect(result.order).toMatchObject({
    businessOrderReference: 'merchant-123',
    amountMinor: Amount.of(1999n),
    status: 'pending',
  });
  expect(result.order.currency.code).toBe('EUR');
  expect(stores.data.orders.size).toBe(1);
});

test('a matching retry returns the existing order without creating another', async () => {
  const { stores, submit } = setup();
  const first = await submit();
  const retry = await submit();
  expect(retry.created).toBe(false);
  expect(retry.order).toBe(first.order);
  expect(stores.data.orders.size).toBe(1);
});

test.each([
  ['amount', { amountMinor: '2000' }],
  ['currency', { currency: 'USD' }],
  ['amount and currency', { amountMinor: '1', currency: 'GBP' }],
])(
  'a changed %s is rejected and leaves the order untouched',
  async (_name, change) => {
    const { stores, submit } = setup();
    const first = await submit();
    await expect(submit(change)).rejects.toBeInstanceOf(CheckoutConflict);
    expect([...stores.data.orders.values()]).toEqual([first.order]);
  },
);

test('a failure after the order is inserted rolls the whole checkout back', async () => {
  const { stores } = setup();
  const failing: CheckoutStore = {
    transaction: (work) =>
      stores.checkout.transaction((session) =>
        work({
          ...session,
          insertIfAbsent: async (order) => {
            await session.insertIfAbsent(order);
            throw new Error('Injected failure');
          },
        }),
      ),
  };
  const handler = new CreateCheckoutHandler(failing, stores.ids, stores.clock);
  await expect(handler.handle(CreateCheckout.from(body))).rejects.toThrow(
    'Injected failure',
  );
  expect(stores.data.orders.size).toBe(0);
  const retry = await new CreateCheckoutHandler(
    stores.checkout,
    stores.ids,
    stores.clock,
  ).handle(CreateCheckout.from(body));
  expect(retry.created).toBe(true);
});

test('an order that vanishes between insert and lookup is a processing error', async () => {
  const { stores } = setup();
  const vanishing: CheckoutStore = {
    transaction: (work) =>
      stores.checkout.transaction((session) =>
        work({
          ...session,
          insertIfAbsent: async () => false,
          findByReference: async () => undefined,
        }),
      ),
  };
  await expect(
    new CreateCheckoutHandler(vanishing, stores.ids, stores.clock).handle(
      CreateCheckout.from(body),
    ),
  ).rejects.toThrow('Checkout order disappeared during creation');
});

test('the order takes its identifier and timestamps from the injected generator and clock', async () => {
  const { stores, submit } = setup();
  const first = await submit();
  stores.clock.advance(5000);
  const second = await submit({ businessOrderReference: 'second' });
  expect(first.order.id).toBe('00000000-0000-4000-8000-000000000001');
  expect(String(first.order.createdAt)).toBe('2026-10-01T10:00:00.000Z');
  expect(first.order.updatedAt.equals(first.order.createdAt)).toBe(true);
  expect(second.order.id).toBe('00000000-0000-4000-8000-000000000002');
  expect(String(second.order.createdAt)).toBe('2026-10-01T10:00:05.000Z');
});

test('a retry keeps the original identifier and timestamps', async () => {
  const { stores, submit } = setup();
  const first = await submit();
  stores.clock.advance(60000);
  const retry = await submit();
  expect(retry.order.id).toBe(first.order.id);
  expect(retry.order.createdAt.equals(first.order.createdAt)).toBe(true);
  expect(retry.order.updatedAt.equals(first.order.updatedAt)).toBe(true);
});
