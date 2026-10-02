import { BusinessOrderReference } from '#src/features/checkout/domain/business-order-reference';
import { Order } from '#src/features/orders/domain/order';
import { OrderId } from '#src/features/orders/domain/order-id';
import { Amount } from '#src/shared/domain/amount';
import { Currency } from '#src/shared/domain/currency';
import { Timestamp } from '#src/shared/domain/timestamp';

const at = (iso: string) => Timestamp.of(new Date(iso));
const placedAt = at('2026-10-01T10:00:00.000Z');
const later = at('2026-10-01T10:05:00.000Z');
const latest = at('2026-10-01T10:10:00.000Z');

const pending = () =>
  Order.place(
    {
      businessOrderReference: BusinessOrderReference.parse('merchant-123'),
      amountMinor: Amount.of(1999n),
      currency: Currency.of('EUR'),
    },
    OrderId.parse('11111111-1111-4111-8111-111111111111'),
    placedAt,
  );

test('a placed order is pending and its timestamps match', () => {
  const order = pending();
  expect(order.status).toBe('pending');
  expect(order.createdAt).toBe(placedAt);
  expect(order.updatedAt).toBe(placedAt);
});

test.each(['failed', 'succeeded'] as const)(
  'applying %s to a pending order changes status and stamps the update',
  (outcome) => {
    const order = pending();
    const next = order.applyOutcome(outcome, later);
    expect(next).not.toBe(order);
    expect(next.status).toBe(outcome);
    expect(next.updatedAt).toBe(later);
    expect(next.createdAt).toBe(placedAt);
    expect(order.status).toBe('pending');
    expect(next.id).toBe(order.id);
    expect(next.matchesCheckout(order)).toBe(true);
  },
);

test('an outcome that changes nothing returns the same order untouched', () => {
  const failed = pending().applyOutcome('failed', later);
  expect(failed.applyOutcome('failed', latest)).toBe(failed);
  const succeeded = failed.applyOutcome('succeeded', latest);
  expect(
    succeeded.applyOutcome('succeeded', at('2026-10-01T11:00:00.000Z')),
  ).toBe(succeeded);
  expect(succeeded.applyOutcome('failed', at('2026-10-01T11:00:00.000Z'))).toBe(
    succeeded,
  );
  expect(succeeded.updatedAt).toBe(latest);
});

test('a failed order can be corrected by a later success', () => {
  const failed = pending().applyOutcome('failed', later);
  const succeeded = failed.applyOutcome('succeeded', latest);
  expect(succeeded.status).toBe('succeeded');
  expect(succeeded.updatedAt).toBe(latest);
});
