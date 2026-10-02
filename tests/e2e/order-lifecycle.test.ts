import request from 'supertest';
import { createFixture, validCheckout } from '#tests/support/e2e-fixture';

const fixture = createFixture();

beforeAll(fixture.prepare);
beforeEach(fixture.reset);
afterAll(fixture.close);

const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test('an order moves from checkout through payment to a readable final state', async () => {
  const created = await fixture.checkout();
  expect(created.status).toBe(201);
  expect(created.headers['content-type']).toMatch(/^application\/json/);
  expect(created.body).toEqual({
    id: expect.stringMatching(uuidV4),
    businessOrderReference: 'merchant-123',
    amountMinor: '1999',
    currency: 'EUR',
    status: 'pending',
    createdAt: expect.stringMatching(isoUtc),
    updatedAt: expect.stringMatching(isoUtc),
  });
  expect(created.body.updatedAt).toBe(created.body.createdAt);

  const pending = await fixture.order(created.body.id);
  expect(pending.status).toBe(200);
  expect(pending.body).toEqual(created.body);

  const paid = await fixture.webhook(created.body.id, 'evt-paid');
  expect(paid.status).toBe(200);
  expect(paid.body).toEqual({ duplicate: false });

  const settled = await fixture.order(created.body.id);
  expect(settled.body).toEqual({
    ...created.body,
    status: 'succeeded',
    updatedAt: expect.stringMatching(isoUtc),
  });
  expect(Date.parse(settled.body.updatedAt)).toBeGreaterThanOrEqual(
    Date.parse(settled.body.createdAt),
  );
});

test('each order receives its own identifier and creation timestamp order', async () => {
  const first = await fixture.place('first');
  const second = await fixture.place('second');
  expect(first.id).not.toBe(second.id);
  expect(Date.parse(second.createdAt)).toBeGreaterThanOrEqual(
    Date.parse(first.createdAt),
  );
});

test('a matching retry without a key returns the same order and never rewrites it', async () => {
  const first = await fixture.checkout();
  const second = await fixture.checkout();
  expect(second.status).toBe(200);
  expect(second.body).toEqual(first.body);
  await fixture.webhook(first.body.id, 'evt-1');
  const settled = (await fixture.order(first.body.id)).body;
  const third = await fixture.checkout();
  expect(third.status).toBe(200);
  expect(third.body).toEqual(settled);
  expect(third.body.status).toBe('succeeded');
  expect(third.body.createdAt).toBe(first.body.createdAt);
  expect(await fixture.count('orders')).toBe(1);
});

test.each([
  ['amount', { amountMinor: '2000' }],
  ['currency', { currency: 'USD' }],
  ['amount and currency', { amountMinor: '1', currency: 'GBP' }],
])(
  'a changed %s for an existing reference is a 409 that leaves the order untouched',
  async (_name, change) => {
    const first = await fixture.place();
    await fixture.webhook(first.id, 'evt-1', 'failed');
    const before = (await fixture.order(first.id)).body;
    const response = await fixture.checkout({ ...validCheckout, ...change });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error:
        'Business order reference already has a different checkout payload',
    });
    expect((await fixture.order(first.id)).body).toEqual(before);
    expect(await fixture.count('orders')).toBe(1);
  },
);

test('a business order reference is unique across the whole service, whoever submits it', async () => {
  const first = await fixture.checkout().set('Idempotency-Key', 'caller-a');
  const matching = await fixture.checkout().set('Idempotency-Key', 'caller-b');
  const changed = await fixture
    .checkout({ ...validCheckout, amountMinor: '2000' })
    .set('Idempotency-Key', 'caller-c');
  const unkeyed = await fixture.checkout({ ...validCheckout, currency: 'USD' });
  expect(first.status).toBe(201);
  expect(matching.status).toBe(200);
  expect(matching.body.id).toBe(first.body.id);
  expect(changed.status).toBe(409);
  expect(unkeyed.status).toBe(409);
  expect(await fixture.count('orders')).toBe(1);
  expect((await fixture.order(first.body.id)).body).toEqual(first.body);
});

const transitions: [string, string[], string][] = [
  ['a single failure', ['failed'], 'failed'],
  ['a single success', ['succeeded'], 'succeeded'],
  ['a failure corrected by success', ['failed', 'succeeded'], 'succeeded'],
  ['a success followed by a failure', ['succeeded', 'failed'], 'succeeded'],
  ['repeated failures', ['failed', 'failed', 'failed'], 'failed'],
  ['repeated successes', ['succeeded', 'succeeded'], 'succeeded'],
  [
    'a failure, a success, then another failure',
    ['failed', 'succeeded', 'failed'],
    'succeeded',
  ],
  [
    'alternating outcomes ending in failure',
    ['failed', 'succeeded', 'failed', 'succeeded', 'failed'],
    'succeeded',
  ],
];

test.each(transitions)(
  'status after %s is %s and every distinct event is retained',
  async (_name, outcomes, expected) => {
    const order = await fixture.place();
    for (const [index, outcome] of outcomes.entries()) {
      const response = await fixture.webhook(
        order.id,
        `event-${index}`,
        outcome,
      );
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ duplicate: false });
    }
    expect((await fixture.order(order.id)).body.status).toBe(expected);
    expect(await fixture.count('provider_events')).toBe(outcomes.length);
  },
);

test('redelivering an old event after the order moved on is acknowledged without regression', async () => {
  const order = await fixture.place();
  await fixture.webhook(order.id, 'evt-1', 'failed');
  await fixture.webhook(order.id, 'evt-2', 'succeeded');
  const settled = (await fixture.order(order.id)).body;
  const redelivery = await fixture.webhook(order.id, 'evt-1', 'failed');
  expect(redelivery.status).toBe(200);
  expect(redelivery.body).toEqual({ duplicate: true });
  expect((await fixture.order(order.id)).body).toEqual(settled);
  expect(await fixture.count('provider_events')).toBe(2);
});

test('a failure event never changes timestamps once an order succeeded', async () => {
  const order = await fixture.place();
  await fixture.webhook(order.id, 'evt-1', 'succeeded');
  const settled = (await fixture.order(order.id)).body;
  await fixture.webhook(order.id, 'evt-2', 'failed');
  expect((await fixture.order(order.id)).body).toEqual(settled);
});

test('payments for one order do not affect another', async () => {
  const first = await fixture.place('first');
  const second = await fixture.place('second');
  const third = await fixture.place('third');
  await fixture.webhook(first.id, 'evt-a', 'succeeded');
  await fixture.webhook(second.id, 'evt-b', 'failed');
  expect((await fixture.order(first.id)).body.status).toBe('succeeded');
  expect((await fixture.order(second.id)).body.status).toBe('failed');
  expect((await fixture.order(third.id)).body.status).toBe('pending');
  expect((await fixture.order(third.id)).body.updatedAt).toBe(third.updatedAt);
});

test('an event ID used for one order does not turn an unknown order into a conflict', async () => {
  const order = await fixture.place();
  await fixture.webhook(order.id, 'shared-event');
  const unknown = await fixture.webhook(
    '99999999-9999-4999-8999-999999999999',
    'shared-event',
  );
  expect(unknown.status).toBe(404);
  expect(unknown.body).toEqual({ error: 'Order not found' });
  expect(await fixture.count('provider_events')).toBe(1);
});

test('a webhook for an unknown order has no side effects', async () => {
  const missing = '55555555-5555-4555-8555-555555555555';
  expect((await fixture.webhook(missing, 'early')).status).toBe(404);
  expect(await fixture.count('provider_events')).toBe(0);
  expect(await fixture.count('orders')).toBe(0);
});

test('conflicting event replays report 409 and never apply the changed outcome', async () => {
  const order = await fixture.place();
  await fixture.webhook(order.id, 'evt-1', 'failed');
  const replay = await fixture.webhook(order.id, 'evt-1', 'succeeded');
  expect(replay.status).toBe(409);
  expect(replay.body).toEqual({
    error: 'Provider event ID already has a different payload',
  });
  expect((await fixture.order(order.id)).body.status).toBe('failed');
});

test('webhooks are accepted whatever Authorization header the provider sends', async () => {
  const order = await fixture.place();
  const withBadKey = await fixture
    .webhook(order.id, 'evt-1', 'failed')
    .set('Authorization', 'Bearer not-the-key');
  const withOtherScheme = await fixture
    .webhook(order.id, 'evt-2', 'succeeded')
    .set('Authorization', 'Basic Zm9vOmJhcg==');
  expect(withBadKey.status).toBe(200);
  expect(withOtherScheme.status).toBe(200);
});

test('identifiers are accepted in any letter case and returned in canonical form', async () => {
  const order = await fixture.place();
  const upper = order.id.toUpperCase();
  const read = await fixture.order(upper);
  expect(read.status).toBe(200);
  expect(read.body.id).toBe(order.id);
  const paid = await fixture.webhook(upper, 'evt-upper');
  expect(paid.status).toBe(200);
  expect(await fixture.webhook(order.id, 'evt-upper')).toMatchObject({
    status: 200,
    body: { duplicate: true },
  });
});

test('order lookups for unknown identifiers are 404 and malformed ones are 400', async () => {
  const unknown = await fixture.order('77777777-7777-4777-8777-777777777777');
  expect(unknown.status).toBe(404);
  expect(unknown.body).toEqual({ error: 'Order not found' });
  for (const malformed of [
    'not-a-uuid',
    '123',
    '11111111-1111-4111-8111-11111111111',
    'g1111111-1111-4111-8111-111111111111',
    encodeURIComponent("' OR 1=1 --"),
    encodeURIComponent(
      '11111111-1111-4111-8111-111111111111; DROP TABLE orders',
    ),
  ]) {
    const response = await fixture.order(malformed);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request');
  }
  expect(await fixture.count('orders')).toBe(0);
});

test('query strings on order lookups are ignored', async () => {
  const order = await fixture.place();
  const response = await request(fixture.app)
    .get(`/orders/${order.id}?expand=events&status=failed`)
    .set('Authorization', fixture.authorization);
  expect(response.status).toBe(200);
  expect(response.body).toEqual(order);
});

test('every error response is a JSON object with an error message', async () => {
  const order = await fixture.place();
  const responses = await Promise.all([
    fixture.order('77777777-7777-4777-8777-777777777777'),
    fixture.order('bad'),
    fixture.checkout({ ...validCheckout, amountMinor: '0' }),
    fixture.checkout({ ...validCheckout, amountMinor: '5' }),
    fixture.webhook(order.id, 'e', 'bogus'),
    request(fixture.app).get('/nowhere'),
    request(fixture.app).get(`/orders/${order.id}`),
  ]);
  for (const response of responses) {
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(typeof response.body.error).toBe('string');
    expect(response.body.error.length).toBeGreaterThan(0);
  }
});

test('error responses do not reveal stack traces, SQL or driver details', async () => {
  const order = await fixture.place();
  const responses = await Promise.all([
    fixture.checkout({ ...validCheckout, amountMinor: 'x' }),
    fixture.webhook(order.id, 'e', 'bogus'),
    fixture.order('77777777-7777-4777-8777-777777777777'),
    fixture.checkout({ ...validCheckout, amountMinor: '5' }),
  ]);
  for (const response of responses) {
    const text = JSON.stringify(response.body);
    expect(text).not.toMatch(
      /stack|at Object|node_modules|SELECT |INSERT |postgres|pg_|constraint/i,
    );
  }
});
