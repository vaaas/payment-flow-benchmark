import { CurrencyCode } from '#src/shared/domain/currency-code';

test.each(['EUR', 'USD', 'XXX', 'ZZZ'])(
  'accepts the well-formed code %s',
  (value) => {
    expect(CurrencyCode.parse(value)).toBe(value);
  },
);

test.each([
  'eur',
  'Eur',
  'EU',
  'EURO',
  'E1R',
  '',
  ' EUR',
  'EUR ',
  '€€€',
  978,
  null,
])('rejects %p', (value) => {
  expect(CurrencyCode.schema.safeParse(value).success).toBe(false);
});
