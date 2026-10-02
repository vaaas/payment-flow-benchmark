import { Clock } from '#src/shared/domain/clock';
import { Timestamp } from '#src/shared/domain/timestamp';

const iso = '2026-10-01T10:00:00.123Z';

test('a timestamp round-trips an ISO date-time with millisecond precision', () => {
  const timestamp = Timestamp.schema.parse(iso);
  expect(timestamp).toBeInstanceOf(Timestamp);
  expect(String(timestamp)).toBe(iso);
  expect(timestamp.toDate().toISOString()).toBe(iso);
  expect(JSON.stringify({ at: timestamp })).toBe(`{"at":"${iso}"}`);
});

test.each([
  '',
  'yesterday',
  '2026-10-01',
  '2026-10-01 10:00:00',
  '2026-13-01T10:00:00Z',
  '2026-10-01T25:00:00Z',
  1759312800000,
  null,
  undefined,
])('the parser rejects %p', (input) => {
  expect(Timestamp.schema.safeParse(input).success).toBe(false);
});

test('Timestamp.of rejects an invalid date', () => {
  expect(() => Timestamp.of(new Date('nonsense'))).toThrow(Error);
});

test('a timestamp does not change when the source date is mutated', () => {
  const source = new Date(iso);
  const timestamp = Timestamp.of(source);
  source.setUTCFullYear(1999);
  expect(String(timestamp)).toBe(iso);
  const copy = timestamp.toDate();
  copy.setUTCFullYear(1999);
  expect(String(timestamp)).toBe(iso);
});

test('timestamps compare by instant', () => {
  const earlier = Timestamp.schema.parse('2026-10-01T10:00:00.000Z');
  const later = Timestamp.schema.parse('2026-10-01T10:00:00.001Z');
  expect(earlier.isBefore(later)).toBe(true);
  expect(later.isBefore(earlier)).toBe(false);
  expect(earlier.isBefore(earlier)).toBe(false);
  expect(
    earlier.equals(Timestamp.of(new Date('2026-10-01T10:00:00.000Z'))),
  ).toBe(true);
  expect(earlier.equals(later)).toBe(false);
});

test('a timestamp is immutable', () => {
  const timestamp = Timestamp.of(new Date(iso));
  expect(Object.isFrozen(timestamp)).toBe(true);
});

test('the clock reports the current time', () => {
  const before = Date.now();
  const reported = Clock.provide().now().epochMilliseconds;
  expect(reported).toBeGreaterThanOrEqual(before);
  expect(reported).toBeLessThanOrEqual(Date.now());
});
