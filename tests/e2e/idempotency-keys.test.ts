import request from 'supertest';
import { createFixture, validCheckout } from '#tests/support/e2e-fixture';

const fixture = createFixture();

beforeAll(fixture.prepare);
beforeEach(fixture.reset);
afterAll(fixture.close);

const keyed = (key: string, body: object = validCheckout) =>
  fixture.checkout(body).set('Idempotency-Key', key);

test.each([
  ['a single character', 'k'],
  ['128 characters', 'k'.repeat(128)],
  ['inner spaces', 'order 42 attempt 1'],
  ['URL-like text', 'https://example.test/checkout?attempt=1'],
  ['SQL metacharacters', `'; DROP TABLE orders;-- "x" \\ $1`],
  ['a UUID', '3f2b8c7e-1d4a-4b5c-9e8f-0a1b2c3d4e5f'],
])(
  'a key made of %s creates once and replays identically',
  async (_name, key) => {
    const first = await keyed(key);
    const replay = await keyed(key);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(await fixture.count('orders')).toBe(1);
    expect(await fixture.count('checkout_idempotency_keys')).toBe(1);
  },
);

test('a key over 128 characters is refused without creating an order', async () => {
  const response = await keyed('k'.repeat(129));
  expect(response.status).toBe(400);
  expect(await fixture.count('orders')).toBe(0);
});

test('the header name is matched case-insensitively', async () => {
  const first = await fixture.checkout().set('IDEMPOTENCY-KEY', 'shouting');
  const replay = await fixture.checkout().set('idempotency-key', 'shouting');
  expect(first.status).toBe(201);
  expect(replay.status).toBe(200);
  expect(replay.body.id).toBe(first.body.id);
});

test('keys are case-sensitive and independent of one another', async () => {
  const lower = await keyed('submission', {
    ...validCheckout,
    businessOrderReference: 'lower',
  });
  const upper = await keyed('SUBMISSION', {
    ...validCheckout,
    businessOrderReference: 'upper',
  });
  expect(lower.status).toBe(201);
  expect(upper.status).toBe(201);
  expect(upper.body.id).not.toBe(lower.body.id);
  expect(await fixture.count('checkout_idempotency_keys')).toBe(2);
});

test('a keyed first request and an unkeyed retry of the same payload agree', async () => {
  const keyedFirst = await keyed('first-keyed');
  const unkeyed = await fixture.checkout();
  expect(unkeyed.status).toBe(200);
  expect(unkeyed.body.id).toBe(keyedFirst.body.id);
  expect(await fixture.count('checkout_idempotency_keys')).toBe(1);
});

test('an unkeyed first request does not block a later key from binding to the same order', async () => {
  const unkeyed = await fixture.checkout();
  const later = await keyed('late-key');
  expect(later.status).toBe(200);
  expect(later.body.id).toBe(unkeyed.body.id);
  expect(await fixture.count('checkout_idempotency_keys')).toBe(1);
});

test('replays are validated before the stored key is consulted', async () => {
  await keyed('validated');
  const invalidBody = await keyed('validated', {
    ...validCheckout,
    amountMinor: '0',
  });
  const unknownField = await keyed('validated', { ...validCheckout, extra: 1 });
  expect(invalidBody.status).toBe(400);
  expect(unknownField.status).toBe(400);
  expect(await fixture.count('orders')).toBe(1);
});

test('replays still require authentication', async () => {
  await keyed('authenticated');
  const response = await request(fixture.app)
    .post('/checkout-intents')
    .set('Idempotency-Key', 'authenticated')
    .send(validCheckout);
  expect(response.status).toBe(401);
});

test('a replay reflects every payment event recorded since the first request', async () => {
  const first = await keyed('tracks-status');
  expect((await keyed('tracks-status')).body.status).toBe('pending');
  await fixture.webhook(first.body.id, 'evt-1', 'failed');
  expect((await keyed('tracks-status')).body.status).toBe('failed');
  await fixture.webhook(first.body.id, 'evt-2', 'succeeded');
  const final = await keyed('tracks-status');
  expect(final.body.status).toBe('succeeded');
  expect(final.body.updatedAt).not.toBe(first.body.updatedAt);
});

test('a key keeps pointing at its first order when later requests describe other orders', async () => {
  const first = await keyed('pinned', {
    ...validCheckout,
    businessOrderReference: 'pinned-first',
  });
  const other = await fixture.place('independent');
  const replay = await keyed('pinned', {
    ...validCheckout,
    businessOrderReference: 'independent',
    amountMinor: '7',
  });
  expect(replay.status).toBe(200);
  expect(replay.body.id).toBe(first.body.id);
  expect(replay.body.id).not.toBe(other.id);
  expect(await fixture.count('orders')).toBe(2);
});

test('a conflicting request with a fresh key neither creates an order nor consumes the key', async () => {
  await fixture.place();
  const conflict = await keyed('fresh', { ...validCheckout, amountMinor: '5' });
  expect(conflict.status).toBe(409);
  expect(await fixture.count('checkout_idempotency_keys')).toBe(0);
  expect(await fixture.count('orders')).toBe(1);
});

test('a validation failure never consumes a key', async () => {
  const rejected = await keyed('after-typo', {
    ...validCheckout,
    currency: 'euro',
  });
  expect(rejected.status).toBe(400);
  const corrected = await keyed('after-typo');
  expect(corrected.status).toBe(201);
});

test('many different keys for one payload converge on a single order without errors', async () => {
  const responses = await Promise.all(
    Array.from({ length: 25 }, (_, index) => keyed(`attempt-${index}`)),
  );
  expect(responses.filter((response) => response.status === 201)).toHaveLength(
    1,
  );
  expect(responses.filter((response) => response.status === 200)).toHaveLength(
    24,
  );
  expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
  expect(await fixture.count('orders')).toBe(1);
  expect(await fixture.count('checkout_idempotency_keys')).toBe(25);
});

test('independent keyed submissions in parallel each create their own order', async () => {
  const responses = await Promise.all(
    Array.from({ length: 25 }, (_, index) =>
      keyed(`independent-${index}`, {
        ...validCheckout,
        businessOrderReference: `independent-order-${index}`,
        amountMinor: String(index + 1),
      }),
    ),
  );
  expect(responses.every((response) => response.status === 201)).toBe(true);
  expect(new Set(responses.map((response) => response.body.id)).size).toBe(25);
  expect(await fixture.count('orders')).toBe(25);
  expect(await fixture.count('checkout_idempotency_keys')).toBe(25);
});

test('replays running concurrently with payment events always observe a legal status', async () => {
  const first = await keyed('racing');
  const operations = Array.from({ length: 20 }, (_, index) =>
    index % 2 === 0
      ? keyed('racing')
      : fixture.webhook(first.body.id, `event-${index}`, 'succeeded'),
  );
  const responses = await Promise.all(operations);
  expect(responses.every((response) => response.status === 200)).toBe(true);
  for (const replay of responses.filter((_, index) => index % 2 === 0))
    expect(['pending', 'succeeded']).toContain(replay.body.status);
  expect((await keyed('racing')).body.status).toBe('succeeded');
});
