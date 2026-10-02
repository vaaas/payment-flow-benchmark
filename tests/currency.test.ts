import { codes } from 'currency-codes';
import { z } from 'zod';
import { Currency } from '#src/shared/domain/currency';

const nonCurrencyCodes = [
  'XXX',
  'XTS',
  'XAU',
  'XAG',
  'XPD',
  'XPT',
  'XDR',
  'XBA',
  'XBB',
  'XBC',
  'XBD',
  'XSU',
  'XUA',
];

test.each([
  ['USD', 2],
  ['EUR', 2],
  ['JPY', 0],
  ['KRW', 0],
  ['BHD', 3],
  ['KWD', 3],
  ['CLF', 4],
  ['XOF', 0],
])('%s has %i minor-unit digits', (code, digits) => {
  const currency = Currency.of(code);
  expect(currency.code).toBe(code);
  expect(currency.minorUnitDigits).toBe(digits);
});

test.each([
  'ZZZ',
  'ABC',
  'AAA',
  'eur',
  'Eur',
  'EU',
  'EURO',
  '',
  ' EUR',
  'EUR ',
])('Currency.of rejects the unknown code %j with a plain error', (code) => {
  expect(() => Currency.of(code)).toThrow(Error);
  expect(() => Currency.of(code)).not.toThrow(z.ZodError);
});

test.each(nonCurrencyCodes)(
  'Currency.of rejects %s, which is not a payment currency',
  (code) => {
    expect(() => Currency.of(code)).toThrow(/Unknown currency/);
  },
);

test('every ISO 4217 currency except the non-currency codes is available', () => {
  const expected = codes().filter((code) => !nonCurrencyCodes.includes(code));
  expect(Currency.codes()).toEqual([...expected].sort());
  for (const code of expected) expect(Currency.of(code).code).toBe(code);
});

test('equal codes yield equal currencies and different codes do not', () => {
  expect(Currency.of('EUR').equals(Currency.of('EUR'))).toBe(true);
  expect(Currency.of('EUR').equals(Currency.of('USD'))).toBe(false);
});

test('a currency serializes to its bare code', () => {
  expect(String(Currency.of('GBP'))).toBe('GBP');
  expect(JSON.stringify({ currency: Currency.of('GBP') })).toBe(
    '{"currency":"GBP"}',
  );
});

test('a currency is immutable', () => {
  const currency = Currency.of('EUR');
  expect(Object.isFrozen(currency)).toBe(true);
  expect(() => {
    (currency as { code: string }).code = 'USD';
  }).toThrow();
});

test('the parser turns a known code into a currency', () => {
  const parsed = Currency.schema.parse('JPY');
  expect(parsed).toBeInstanceOf(Currency);
  expect(parsed.minorUnitDigits).toBe(0);
});

test.each([
  'ZZZ',
  'eur',
  'EU',
  '',
  'XXX',
  'XAU',
  42,
  null,
  undefined,
  ['EUR'],
  { code: 'EUR' },
])('the parser rejects %j', (input) => {
  expect(Currency.schema.safeParse(input).success).toBe(false);
});
