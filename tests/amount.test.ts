import { Amount } from '#src/shared/domain/amount';

test.each([
  ['1', 1n],
  ['1999', 1999n],
  ['1000000000000000000', 1000000000000000000n],
  ['9223372036854775807', 9223372036854775807n],
])('parses %s into %s minor units', (digits, minorUnits) => {
  const amount = Amount.schema.parse(digits);
  expect(amount).toBeInstanceOf(Amount);
  expect(amount.minorUnits).toBe(minorUnits);
});

test.each([
  '0',
  '-1',
  '+5',
  '01',
  '1.5',
  '1e3',
  '0x10',
  ' 5',
  '5 ',
  '',
  'NaN',
  '1,000',
  '١٢٣',
  '9223372036854775808',
  '9999999999999999999',
  '10000000000000000000',
  1999,
  1999n,
  null,
  undefined,
  true,
])('the parser rejects %p', (input) => {
  expect(Amount.schema.safeParse(input).success).toBe(false);
});

test.each([0n, -1n, 9223372036854775808n])(
  'Amount.of rejects the out-of-range value %s',
  (minorUnits) => {
    expect(() => Amount.of(minorUnits)).toThrow(Error);
  },
);

test('amounts compare by value', () => {
  expect(Amount.of(5n).equals(Amount.of(5n))).toBe(true);
  expect(Amount.of(5n).equals(Amount.of(6n))).toBe(false);
});

test('an amount serializes to its decimal string without losing precision', () => {
  const largest = Amount.of(9223372036854775807n);
  expect(String(largest)).toBe('9223372036854775807');
  expect(JSON.stringify({ amountMinor: largest })).toBe(
    '{"amountMinor":"9223372036854775807"}',
  );
});

test('an amount is immutable', () => {
  const amount = Amount.of(5n);
  expect(Object.isFrozen(amount)).toBe(true);
  expect(() => {
    (amount as { minorUnits: bigint }).minorUnits = 6n;
  }).toThrow();
});
