import request from 'supertest';
import type { Response } from 'supertest';
import { createFixture, validCheckout } from '#tests/support/e2e-fixture';
import {
  documentedStatuses,
  openApiSpec,
  schemaNamed,
  violations,
} from '#tests/support/openapi-conformance';

const fixture = createFixture();

beforeAll(fixture.prepare);
beforeEach(fixture.reset);
afterAll(fixture.close);

const expectDocumented = (
  response: Response,
  path: Parameters<typeof documentedStatuses>[0],
  method: string,
) => {
  expect(documentedStatuses(path, method)).toContain(String(response.status));
};

const expectConforms = (schemaName: string, body: unknown) => {
  expect(violations(schemaNamed(schemaName), body)).toEqual([]);
};

test('the specification example for checkout creation is accepted as documented', async () => {
  const example =
    openApiSpec.paths['/checkout-intents'].post.requestBody.content[
      'application/json'
    ].example;
  const response = await fixture.checkout(example);
  expectDocumented(response, '/checkout-intents', 'post');
  expect(response.status).toBe(201);
  expectConforms('Order', response.body);
});

test('the specification example for webhooks is valid input for an unknown order', async () => {
  const example =
    openApiSpec.paths['/webhooks/payment'].post.requestBody.content[
      'application/json'
    ].example;
  const response = await request(fixture.app)
    .post('/webhooks/payment')
    .send(example);
  expectDocumented(response, '/webhooks/payment', 'post');
  expect(response.status).toBe(404);
  expectConforms('Error', response.body);
});

test('created and retried orders conform to the Order schema with documented statuses', async () => {
  const created = await fixture.checkout();
  const retried = await fixture.checkout();
  for (const response of [created, retried]) {
    expectDocumented(response, '/checkout-intents', 'post');
    expectConforms('Order', response.body);
  }
  const read = await fixture.order(created.body.id);
  expectDocumented(read, '/orders/{id}', 'get');
  expectConforms('Order', read.body);
});

test('orders in every status conform to the Order schema', async () => {
  const pending = await fixture.place('pending');
  const failed = await fixture.place('failed');
  const succeeded = await fixture.place('succeeded');
  await fixture.webhook(failed.id, 'evt-failed', 'failed');
  await fixture.webhook(succeeded.id, 'evt-succeeded', 'succeeded');
  const statuses: string[] = [];
  for (const order of [pending, failed, succeeded]) {
    const response = await fixture.order(order.id);
    expectConforms('Order', response.body);
    statuses.push(response.body.status);
  }
  expect(statuses).toEqual(['pending', 'failed', 'succeeded']);
  expect(schemaNamed('PaymentStatus').enum?.sort()).toEqual(
    [...statuses].sort(),
  );
});

test('webhook acknowledgements conform to the WebhookResponse schema', async () => {
  const order = await fixture.place();
  const first = await fixture.webhook(order.id, 'evt-1');
  const duplicate = await fixture.webhook(order.id, 'evt-1');
  for (const response of [first, duplicate]) {
    expectDocumented(response, '/webhooks/payment', 'post');
    expectConforms('WebhookResponse', response.body);
  }
});

test.each([
  [
    'validation failure',
    () => fixture.checkout({ ...validCheckout, currency: 'x' }),
    '/checkout-intents',
    'post',
    400,
  ],
  [
    'reference conflict',
    async () => {
      await fixture.place();
      return fixture.checkout({ ...validCheckout, amountMinor: '3' });
    },
    '/checkout-intents',
    'post',
    409,
  ],
  [
    'missing credentials',
    () => request(fixture.app).post('/checkout-intents').send(validCheckout),
    '/checkout-intents',
    'post',
    401,
  ],
  [
    'oversized body',
    () =>
      request(fixture.app)
        .post('/checkout-intents')
        .set('Authorization', fixture.authorization)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ ...validCheckout, pad: 'x'.repeat(20000) })),
    '/checkout-intents',
    'post',
    413,
  ],
  [
    'unsupported charset',
    () =>
      request(fixture.app)
        .post('/checkout-intents')
        .set('Authorization', fixture.authorization)
        .set('Content-Type', 'application/json; charset=iso-8859-1')
        .send(JSON.stringify(validCheckout)),
    '/checkout-intents',
    'post',
    415,
  ],
  [
    'unknown order lookup',
    () => fixture.order('88888888-8888-4888-8888-888888888888'),
    '/orders/{id}',
    'get',
    404,
  ],
  [
    'malformed order lookup',
    () => fixture.order('nope'),
    '/orders/{id}',
    'get',
    400,
  ],
  [
    'unauthenticated lookup',
    () =>
      request(fixture.app).get('/orders/88888888-8888-4888-8888-888888888888'),
    '/orders/{id}',
    'get',
    401,
  ],
  [
    'webhook validation failure',
    () => request(fixture.app).post('/webhooks/payment').send({}),
    '/webhooks/payment',
    'post',
    400,
  ],
  [
    'webhook for unknown order',
    () => fixture.webhook('88888888-8888-4888-8888-888888888888', 'e'),
    '/webhooks/payment',
    'post',
    404,
  ],
  [
    'webhook oversized body',
    () =>
      request(fixture.app)
        .post('/webhooks/payment')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ pad: 'x'.repeat(20000) })),
    '/webhooks/payment',
    'post',
    413,
  ],
])(
  'a %s produces a documented status and an Error-schema body',
  async (_name, act, path, method, expected) => {
    const response = await act();
    expect(response.status).toBe(expected);
    expectDocumented(
      response,
      path as Parameters<typeof documentedStatuses>[0],
      method,
    );
    expectConforms('Error', response.body);
  },
);

test('a webhook event conflict produces a documented status and an Error-schema body', async () => {
  const order = await fixture.place();
  await fixture.webhook(order.id, 'evt-1', 'failed');
  const response = await fixture.webhook(order.id, 'evt-1', 'succeeded');
  expect(response.status).toBe(409);
  expectDocumented(response, '/webhooks/payment', 'post');
  expectConforms('Error', response.body);
});

test('a rate-limited request produces a documented status and an Error-schema body', async () => {
  const limited = createFixture({ rateLimitMax: 1 });
  try {
    await limited.prepare();
    await limited.checkout();
    const response = await limited.order(
      '88888888-8888-4888-8888-888888888888',
    );
    expect(response.status).toBe(429);
    expectDocumented(response, '/orders/{id}', 'get');
    expectConforms('Error', response.body);
    expect(response.headers['retry-after']).toMatch(/^[1-9][0-9]*$/);
  } finally {
    await limited.close();
  }
});

test('the schema limits documented for identifiers match the limits enforced', async () => {
  const identifier = schemaNamed('Identifier');
  expect(identifier.minLength).toBe(1);
  expect(identifier.maxLength).toBe(128);
  const atLimit = await fixture.checkout({
    ...validCheckout,
    businessOrderReference: 'x'.repeat(identifier.maxLength ?? 0),
  });
  const overLimit = await fixture.checkout({
    ...validCheckout,
    businessOrderReference: 'x'.repeat((identifier.maxLength ?? 0) + 1),
  });
  expect(atLimit.status).toBe(201);
  expect(overLimit.status).toBe(400);
});

test('the documented amount and currency patterns agree with the validator', async () => {
  const amount = new RegExp(schemaNamed('AmountMinor').pattern ?? '');
  const currency = new RegExp(schemaNamed('Currency').pattern ?? '');
  const amounts = [
    '1',
    '10',
    '1999',
    '9223372036854775807',
    '0',
    '01',
    '-1',
    '1.5',
    ' 1',
    '1e3',
  ];
  const currencies = ['EUR', 'USD', 'eur', 'EU', 'EURO', 'E1R'];
  for (const [index, amountMinor] of amounts.entries()) {
    const response = await fixture.checkout({
      ...validCheckout,
      businessOrderReference: `amount-${index}`,
      amountMinor,
    });
    expect(response.status === 201).toBe(amount.test(amountMinor));
  }
  for (const [index, code] of currencies.entries()) {
    const response = await fixture.checkout({
      ...validCheckout,
      businessOrderReference: `currency-${index}`,
      currency: code,
    });
    expect(response.status === 201).toBe(currency.test(code));
  }
});

test('the documented security scheme is the one enforced', async () => {
  const scheme = openApiSpec.components.securitySchemes.BearerApiKey;
  expect(scheme).toMatchObject({ type: 'http', scheme: 'bearer' });
  const unauthenticated = await request(fixture.app)
    .post('/checkout-intents')
    .send(validCheckout);
  expect(unauthenticated.headers['www-authenticate']).toBe('Bearer');
  expect(unauthenticated.status).toBe(401);
});
