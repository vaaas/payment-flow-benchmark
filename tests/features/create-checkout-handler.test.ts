import { Amount } from '#src/shared/domain/amount';
import { IdempotencyKey } from '#src/features/checkout/domain/idempotency-key';
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
  const handler = new CreateCheckoutHandler(stores.checkout);
  const submit = (override: object = {}, key?: string) =>
    handler.handle(CreateCheckout.from({ ...body, ...override }, key));
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

test('the first request for a key wins and later payloads are ignored', async () => {
  const { stores, submit } = setup();
  const first = await submit({}, 'key-1');
  const replay = await submit(
    { businessOrderReference: 'other', amountMinor: '5' },
    'key-1',
  );
  expect(replay.created).toBe(false);
  expect(replay.order).toBe(first.order);
  expect(stores.data.orders.size).toBe(1);
});

test('different keys for a matching payload share one order', async () => {
  const { stores, submit } = setup();
  const first = await submit({}, 'key-1');
  const second = await submit({}, 'key-2');
  expect(second.created).toBe(false);
  expect(second.order).toBe(first.order);
  expect([...stores.data.submissions.keys()]).toEqual(['key-1', 'key-2']);
});

test('a key may bind to an order created without one', async () => {
  const { stores, submit } = setup();
  const first = await submit();
  const keyed = await submit({}, 'late-key');
  expect(keyed.order).toBe(first.order);
  expect(stores.data.submissions.get(IdempotencyKey.parse('late-key'))).toBe(
    first.order.id,
  );
});

test('a conflicting request does not consume its key', async () => {
  const { stores, submit } = setup();
  await submit();
  await expect(
    submit({ amountMinor: '5' }, 'retry-key'),
  ).rejects.toBeInstanceOf(CheckoutConflict);
  expect(stores.data.submissions.size).toBe(0);
  const corrected = await submit(
    { businessOrderReference: 'fixed' },
    'retry-key',
  );
  expect(corrected.created).toBe(true);
});

test('a failure after the order is inserted rolls the whole checkout back', async () => {
  const { stores } = setup();
  const failing: CheckoutStore = {
    transaction: (work) =>
      stores.checkout.transaction((session) =>
        work({
          ...session,
          bindSubmission: async () => {
            throw new Error('Injected failure');
          },
        }),
      ),
  };
  const handler = new CreateCheckoutHandler(failing);
  await expect(
    handler.handle(CreateCheckout.from(body, 'doomed')),
  ).rejects.toThrow('Injected failure');
  expect(stores.data.orders.size).toBe(0);
  expect(stores.data.submissions.size).toBe(0);
  const retry = await new CreateCheckoutHandler(stores.checkout).handle(
    CreateCheckout.from(body, 'doomed'),
  );
  expect(retry.created).toBe(true);
});

test('an order that vanishes between insert and lookup is a processing error', async () => {
  const { stores } = setup();
  const vanishing: CheckoutStore = {
    transaction: (work) =>
      stores.checkout.transaction((session) =>
        work({
          ...session,
          insertIfAbsent: async () => undefined,
          findByReference: async () => undefined,
        }),
      ),
  };
  await expect(
    new CreateCheckoutHandler(vanishing).handle(CreateCheckout.from(body)),
  ).rejects.toThrow('Checkout order disappeared during creation');
});
