import { HttpStatus } from '#src/shared/response/http-status';

test.each([100, 200, 201, 404, 429, 503, 599])('accepts %p', (value) => {
  expect(HttpStatus.parse(value)).toBe(value);
});

test.each([99, 600, 0, -1, 200.5, Number.NaN, '200', null, undefined])(
  'rejects %p',
  (value) => {
    expect(HttpStatus.schema.safeParse(value).success).toBe(false);
  },
);

test('named statuses carry their standard codes', () => {
  expect([
    HttpStatus.ok,
    HttpStatus.created,
    HttpStatus.badRequest,
    HttpStatus.unauthorized,
    HttpStatus.notFound,
    HttpStatus.conflict,
    HttpStatus.tooManyRequests,
    HttpStatus.serviceUnavailable,
  ]).toEqual([200, 201, 400, 401, 404, 409, 429, 503]);
});

test('client errors are exactly the 4xx range', () => {
  expect(HttpStatus.isClientError(399)).toBe(false);
  expect(HttpStatus.isClientError(400)).toBe(true);
  expect(HttpStatus.isClientError(499)).toBe(true);
  expect(HttpStatus.isClientError(500)).toBe(false);
});
