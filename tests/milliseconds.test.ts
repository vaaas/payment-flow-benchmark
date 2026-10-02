import { Milliseconds } from '#src/shared/domain/milliseconds';

test.each([0, 1, 2500, 60000, 0.5])('accepts %p', (value) => {
  expect(Milliseconds.parse(value)).toBe(value);
});

test.each([
  -1,
  -0.001,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  '5',
  null,
  undefined,
])('rejects %p', (value) => {
  expect(Milliseconds.schema.safeParse(value).success).toBe(false);
});

test('arithmetic keeps results valid durations', () => {
  const ten = Milliseconds.parse(10);
  const four = Milliseconds.parse(4);
  expect(Milliseconds.plus(ten, four)).toBe(14);
  expect(Milliseconds.minus(ten, four)).toBe(6);
  expect(() => Milliseconds.minus(four, ten)).toThrow();
});

test('comparison includes equality', () => {
  const five = Milliseconds.parse(5);
  expect(Milliseconds.isAtLeast(five, five)).toBe(true);
  expect(Milliseconds.isAtLeast(Milliseconds.parse(6), five)).toBe(true);
  expect(Milliseconds.isAtLeast(Milliseconds.parse(4), five)).toBe(false);
});
