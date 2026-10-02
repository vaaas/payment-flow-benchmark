import { BusinessOrderReference } from '#src/features/checkout/domain/business-order-reference';
import { IdempotencyKey } from '#src/features/checkout/domain/idempotency-key';
import {
  OrderId,
  OrderIdGenerator,
} from '#src/features/orders/domain/order-id';
import { ProviderEventId } from '#src/features/payments/domain/provider-event-id';

const textIdentifiers = [
  ['BusinessOrderReference', BusinessOrderReference],
  ['IdempotencyKey', IdempotencyKey],
  ['ProviderEventId', ProviderEventId],
] as const;

describe.each(textIdentifiers)('%s', (_name, identifier) => {
  test.each(['x', 'x'.repeat(128), 'inner space', '🧾-😀', 'Case-Sensitive'])(
    'accepts %j and keeps it unchanged',
    (value) => {
      expect(identifier.parse(value)).toBe(value);
    },
  );

  test.each([
    '',
    'x'.repeat(129),
    ' leading',
    'trailing ',
    'tab\t',
    ' nbsp',
    'a\u0000b',
    '\ud800',
    42,
    null,
    undefined,
    ['x'],
  ])('rejects %j', (value) => {
    expect(identifier.schema.safeParse(value).success).toBe(false);
  });
});

describe('OrderId', () => {
  test('accepts a UUID and returns it in lower case', () => {
    expect(OrderId.parse('3F2B8C7E-1D4A-4B5C-9E8F-0A1B2C3D4E5F')).toBe(
      '3f2b8c7e-1d4a-4b5c-9e8f-0a1b2c3d4e5f',
    );
  });

  test.each([
    'not-a-uuid',
    '',
    '123',
    '11111111-1111-4111-8111-11111111111',
    '11111111111141118111111111111111',
    42,
    null,
  ])('rejects %j', (value) => {
    expect(OrderId.schema.safeParse(value).success).toBe(false);
  });

  test('the generator yields distinct valid identifiers', () => {
    const generator = OrderIdGenerator.provide();
    const ids = Array.from({ length: 50 }, () => generator.next());
    expect(new Set(ids).size).toBe(50);
    for (const id of ids) expect(OrderId.parse(id)).toBe(id);
  });
});
