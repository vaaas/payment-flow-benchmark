import request from 'supertest';
import { createFixture, validCheckout } from '#tests/support/e2e-fixture';

const fixture = createFixture();
const rotated = createFixture({ apiKey: 'rotated-secret-key' });
const key = fixture.configuration.apiKey;

beforeAll(async () => {
  await fixture.prepare();
});
beforeEach(async () => {
  await fixture.reset();
});
afterAll(async () => {
  await rotated.close();
  await fixture.close();
});

const privateRequests = (authorization?: string) => {
  const checkout = request(fixture.app)
    .post('/checkout-intents')
    .send(validCheckout);
  const lookup = request(fixture.app).get(
    '/orders/11111111-1111-4111-8111-111111111111',
  );
  if (authorization !== undefined) {
    checkout.set('Authorization', authorization);
    lookup.set('Authorization', authorization);
  }
  return [checkout, lookup];
};

test.each([
  ['no header', undefined],
  ['an empty header', ''],
  ['the key without a scheme', key],
  ['an unsupported scheme', `Basic ${key}`],
  ['a different scheme carrying the key', `Token ${key}`],
  ['a scheme with no credentials', 'Bearer'],
  ['a scheme with blank credentials', 'Bearer  '],
  ['a wrong key', 'Bearer wrong-key'],
  ['the key with an extra character', `Bearer ${key}x`],
  ['a truncated key', `Bearer ${key.slice(0, -1)}`],
  ['the key in another letter case', `Bearer ${key.toUpperCase()}`],
  ['the key preceded by extra spacing', `Bearer  ${key}`],
  ['two copies of the key', `Bearer ${key}, Bearer ${key}`],
  ['the key as a prefix of a longer token', `Bearer ${key}.suffix`],
  ['the empty-string key', 'Bearer ""'],
])(
  'private routes reject %s and store nothing',
  async (_name, authorization) => {
    for (const response of await Promise.all(privateRequests(authorization))) {
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.body).toEqual({
        error: 'Invalid or missing bearer API key',
      });
    }
    expect(await fixture.count('orders')).toBe(0);
  },
);

test('authentication is decided before validation and before existence checks', async () => {
  const invalidBody = await request(fixture.app)
    .post('/checkout-intents')
    .send({ nonsense: true });
  expect(invalidBody.status).toBe(401);
  const malformedId = await request(fixture.app).get('/orders/not-a-uuid');
  expect(malformedId.status).toBe(401);
});

test('unauthenticated callers cannot tell existing orders from missing ones', async () => {
  const order = await fixture.place();
  const existing = await request(fixture.app).get(`/orders/${order.id}`);
  const missing = await request(fixture.app).get(
    '/orders/66666666-6666-4666-8666-666666666666',
  );
  expect(existing.status).toBe(401);
  expect(missing.status).toBe(401);
  expect(existing.body).toEqual(missing.body);
  expect(existing.headers['www-authenticate']).toBe(
    missing.headers['www-authenticate'],
  );
});

test('a failed authentication on an idempotent retry never reveals the stored order', async () => {
  await fixture.checkout().set('Idempotency-Key', 'secret-retry');
  const response = await request(fixture.app)
    .post('/checkout-intents')
    .set('Authorization', 'Bearer wrong')
    .set('Idempotency-Key', 'secret-retry')
    .send(validCheckout);
  expect(response.status).toBe(401);
  expect(response.body).toEqual({ error: 'Invalid or missing bearer API key' });
});

test('the API key is whatever the operator configured', async () => {
  const withDefault = await request(rotated.app)
    .post('/checkout-intents')
    .set('Authorization', `Bearer ${fixture.configuration.apiKey}`)
    .send(validCheckout);
  expect(withDefault.status).toBe(401);
  await rotated.prepare();
  const withRotated = await rotated.checkout();
  expect(withRotated.status).toBe(201);
  expect((await rotated.order(withRotated.body.id)).body.id).toBe(
    withRotated.body.id,
  );
});

test.each([
  ['PUT', '/checkout-intents'],
  ['PATCH', '/checkout-intents'],
  ['DELETE', '/checkout-intents'],
  ['GET', '/checkout-intents'],
  ['GET', '/webhooks/payment'],
  ['PUT', '/webhooks/payment'],
  ['DELETE', '/webhooks/payment'],
  ['POST', '/orders/11111111-1111-4111-8111-111111111111'],
  ['PUT', '/orders/11111111-1111-4111-8111-111111111111'],
  ['DELETE', '/orders/11111111-1111-4111-8111-111111111111'],
  ['POST', '/openapi.json'],
  ['GET', '/orders'],
  ['GET', '/'],
  ['GET', '/checkout-intents/anything'],
  ['POST', '/webhooks/payment/extra'],
  ['GET', '/admin'],
  ['GET', '/.env'],
])(
  '%s %s falls through to the JSON 404 and changes nothing',
  async (method, path) => {
    const response = await request(fixture.app)
      [method.toLowerCase() as 'get'](path)
      .set('Authorization', fixture.authorization)
      .send(method === 'GET' ? undefined : validCheckout);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Route not found' });
    expect(await fixture.count('orders')).toBe(0);
  },
);

test('unknown routes answer 404 even without credentials', async () => {
  expect((await request(fixture.app).get('/nowhere')).status).toBe(404);
  expect((await request(fixture.app).post('/nowhere').send({})).status).toBe(
    404,
  );
});

test('the OpenAPI document is public, stable and describes every served route', async () => {
  const first = await request(fixture.app).get('/openapi.json');
  const second = await request(fixture.app).get('/openapi.json');
  expect(first.status).toBe(200);
  expect(first.headers['content-type']).toMatch(/^application\/json/);
  expect(second.body).toEqual(first.body);
  expect(first.body.openapi).toMatch(/^3\.1\./);
  expect(Object.keys(first.body.paths).sort()).toEqual([
    '/checkout-intents',
    '/openapi.json',
    '/orders/{id}',
    '/webhooks/payment',
  ]);
});

test('the OpenAPI document does not require credentials even when invalid ones are sent', async () => {
  const response = await request(fixture.app)
    .get('/openapi.json')
    .set('Authorization', 'Bearer nonsense');
  expect(response.status).toBe(200);
});

test('every documented operation is actually served', async () => {
  const spec = (await request(fixture.app).get('/openapi.json')).body;
  const order = await fixture.place();
  const concrete = (path: string) => path.replace('{id}', order.id);
  for (const [path, operations] of Object.entries<Record<string, unknown>>(
    spec.paths,
  )) {
    for (const method of Object.keys(operations)) {
      const response = await request(fixture.app)
        [method as 'get' | 'post'](concrete(path))
        .set('Authorization', fixture.authorization)
        .send(method === 'post' ? {} : undefined);
      expect(response.body.error).not.toBe('Route not found');
    }
  }
});

test('every success response is UTF-8 JSON', async () => {
  const order = await fixture.place();
  const responses = await Promise.all([
    fixture.order(order.id),
    fixture.checkout(),
    fixture.webhook(order.id, 'evt-1'),
    request(fixture.app).get('/openapi.json'),
  ]);
  for (const response of responses)
    expect(response.headers['content-type']).toMatch(
      /^application\/json; charset=utf-8$/,
    );
});
