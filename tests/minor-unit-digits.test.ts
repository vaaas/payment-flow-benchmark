import { MinorUnitDigits } from '#src/shared/domain/minor-unit-digits';

test.each([0, 2, 3, 4, 6])('accepts %p', (value) => {
  expect(MinorUnitDigits.parse(value)).toBe(value);
});

test.each([-1, 7, 2.5, Number.NaN, '2', null])('rejects %p', (value) => {
  expect(MinorUnitDigits.schema.safeParse(value).success).toBe(false);
});
