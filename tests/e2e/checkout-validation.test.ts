import request from 'supertest';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { createFixture, validCheckout } from '#tests/support/e2e-fixture';

const fixture = createFixture();

beforeAll(fixture.prepare);
beforeEach(fixture.reset);
afterAll(fixture.close);

const rawCheckout = (body: string | Buffer, contentType = 'application/json') =>
  request(fixture.app)
    .post('/checkout-intents')
    .set('Authorization', fixture.authorization)
    .set('Content-Type', contentType)
    .send(body);

const rawWebhook = (body: string | Buffer, contentType = 'application/json') =>
  request(fixture.app)
    .post('/webhooks/payment')
    .set('Content-Type', contentType)
    .send(body);

const rejectedFields: [string, Record<string, unknown>][] = [
  ['missing reference', { amountMinor: '1', currency: 'EUR' }],
  ['missing amount', { businessOrderReference: 'x', currency: 'EUR' }],
  ['missing currency', { businessOrderReference: 'x', amountMinor: '1' }],
  ['empty object', {}],
  ['numeric reference', { ...validCheckout, businessOrderReference: 42 }],
  ['null reference', { ...validCheckout, businessOrderReference: null }],
  ['array reference', { ...validCheckout, businessOrderReference: ['a'] }],
  ['object reference', { ...validCheckout, businessOrderReference: { a: 1 } }],
  ['empty reference', { ...validCheckout, businessOrderReference: '' }],
  ['leading space', { ...validCheckout, businessOrderReference: ' x' }],
  ['trailing space', { ...validCheckout, businessOrderReference: 'x ' }],
  ['trailing tab', { ...validCheckout, businessOrderReference: 'x\t' }],
  ['trailing newline', { ...validCheckout, businessOrderReference: 'x\n' }],
  [
    'leading no-break space',
    { ...validCheckout, businessOrderReference: ' x' },
  ],
  [
    'reference over 128 characters',
    { ...validCheckout, businessOrderReference: 'x'.repeat(129) },
  ],
  ['numeric amount', { ...validCheckout, amountMinor: 1999 }],
  ['null amount', { ...validCheckout, amountMinor: null }],
  ['boolean amount', { ...validCheckout, amountMinor: true }],
  ['decimal amount', { ...validCheckout, amountMinor: '19.99' }],
  ['negative amount', { ...validCheckout, amountMinor: '-5' }],
  ['signed amount', { ...validCheckout, amountMinor: '+5' }],
  ['exponent amount', { ...validCheckout, amountMinor: '1e3' }],
  ['hexadecimal amount', { ...validCheckout, amountMinor: '0x10' }],
  ['padded amount', { ...validCheckout, amountMinor: ' 5' }],
  ['trailing-space amount', { ...validCheckout, amountMinor: '5 ' }],
  ['empty amount', { ...validCheckout, amountMinor: '' }],
  ['NaN amount', { ...validCheckout, amountMinor: 'NaN' }],
  ['Infinity amount', { ...validCheckout, amountMinor: 'Infinity' }],
  ['grouped amount', { ...validCheckout, amountMinor: '1,000' }],
  ['Arabic-Indic digits', { ...validCheckout, amountMinor: '١٢٣' }],
  ['twenty digit amount', { ...validCheckout, amountMinor: '1'.repeat(20) }],
  [
    'amount just above bigint',
    { ...validCheckout, amountMinor: '9223372036854775808' },
  ],
  [
    'amount near maximum nineteen digits',
    { ...validCheckout, amountMinor: '9999999999999999999' },
  ],
  ['lowercase currency', { ...validCheckout, currency: 'eur' }],
  ['mixed case currency', { ...validCheckout, currency: 'Eur' }],
  ['two letter currency', { ...validCheckout, currency: 'EU' }],
  ['four letter currency', { ...validCheckout, currency: 'EURO' }],
  ['alphanumeric currency', { ...validCheckout, currency: 'E1R' }],
  ['padded currency', { ...validCheckout, currency: 'EUR ' }],
  ['empty currency', { ...validCheckout, currency: '' }],
  ['symbol currency', { ...validCheckout, currency: '€€€' }],
  ['well-formed but unknown currency', { ...validCheckout, currency: 'ZZZ' }],
  ['no-currency code', { ...validCheckout, currency: 'XXX' }],
  ['testing code', { ...validCheckout, currency: 'XTS' }],
  ['precious metal', { ...validCheckout, currency: 'XAU' }],
  ['special drawing right', { ...validCheckout, currency: 'XDR' }],
  ['numeric currency', { ...validCheckout, currency: 978 }],
  ['null currency', { ...validCheckout, currency: null }],
  ['unknown field', { ...validCheckout, note: 'extra' }],
  ['status field', { ...validCheckout, status: 'succeeded' }],
  ['identifier field', { ...validCheckout, id: 'chosen-by-client' }],
];

test.each(rejectedFields)(
  'rejects %s with a descriptive 400 and stores nothing',
  async (_name, body) => {
    const response = await fixture.checkout(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request');
    expect(Array.isArray(response.body.details)).toBe(true);
    expect(response.body.details.length).toBeGreaterThan(0);
    expect(await fixture.count('orders')).toBe(0);
    expect(await fixture.count('checkout_idempotency_keys')).toBe(0);
  },
);

test('validation details point at every offending field', async () => {
  const response = await fixture.checkout({
    businessOrderReference: '',
    amountMinor: '0',
    currency: 'eur',
  });
  const paths = response.body.details.map(
    (issue: { path: string[] }) => issue.path[0],
  );
  expect(paths.sort()).toEqual([
    'amountMinor',
    'businessOrderReference',
    'currency',
  ]);
});

const rejectedRawBodies: [string, string][] = [
  ['truncated JSON', '{"businessOrderReference":'],
  ['trailing comma', '{"businessOrderReference":"x",}'],
  ['single quoted JSON', "{'businessOrderReference':'x'}"],
  ['top-level null', 'null'],
  ['top-level string', '"merchant-123"'],
  ['top-level number', '5'],
  ['top-level boolean', 'true'],
  ['top-level array', JSON.stringify([validCheckout])],
  ['plain text', 'businessOrderReference=x'],
  [
    'prototype key',
    `{"__proto__":{"admin":true},"businessOrderReference":"x","amountMinor":"1","currency":"EUR"}`,
  ],
  [
    'constructor key',
    `{"constructor":{"x":1},"businessOrderReference":"x","amountMinor":"1","currency":"EUR"}`,
  ],
  [
    'NUL escape in reference',
    '{"businessOrderReference":"a\\u0000b","amountMinor":"1","currency":"EUR"}',
  ],
  [
    'lone high surrogate in reference',
    '{"businessOrderReference":"a\\ud800b","amountMinor":"1","currency":"EUR"}',
  ],
  [
    'lone low surrogate in reference',
    '{"businessOrderReference":"a\\udc00b","amountMinor":"1","currency":"EUR"}',
  ],
];

test.each(rejectedRawBodies)(
  'rejects %s as a client error and stores nothing',
  async (_name, body) => {
    const response = await rawCheckout(body);
    expect(response.status).toBe(400);
    expect(await fixture.count('orders')).toBe(0);
  },
);

test('an empty body is a client error, not a processing failure', async () => {
  const response = await rawCheckout('');
  expect(response.status).toBe(400);
  expect(await fixture.count('orders')).toBe(0);
});

test.each([
  ['text/plain', 'text/plain'],
  ['form encoding', 'application/x-www-form-urlencoded'],
  ['XML', 'application/xml'],
])(
  'a valid JSON document labelled %s is not interpreted as JSON',
  async (_name, contentType) => {
    const response = await rawCheckout(
      JSON.stringify(validCheckout),
      contentType,
    );
    expect(response.status).toBe(400);
    expect(await fixture.count('orders')).toBe(0);
  },
);

test.each([
  'application/json; charset=utf-8',
  'application/json;charset=UTF-8',
  'APPLICATION/JSON',
])('accepts the JSON content type %s', async (contentType) => {
  const response = await rawCheckout(
    JSON.stringify(validCheckout),
    contentType,
  );
  expect(response.status).toBe(201);
});

const postCompressed = async (encoding: string, body: Buffer) => {
  const server = await fixture.serve();
  try {
    return await fetch(`${server.url}/checkout-intents`, {
      method: 'POST',
      headers: {
        Authorization: fixture.authorization,
        'Content-Type': 'application/json',
        'Content-Encoding': encoding,
      },
      body: new Uint8Array(body),
    });
  } finally {
    await server.stop();
  }
};

test.each([
  ['gzip', gzipSync],
  ['deflate', deflateSync],
  ['br', brotliCompressSync],
])('accepts a %s-compressed request body', async (encoding, compress) => {
  const response = await postCompressed(
    encoding,
    compress(JSON.stringify(validCheckout)),
  );
  expect(response.status).toBe(201);
  expect((await response.json()).businessOrderReference).toBe('merchant-123');
});

test('an identity-encoded request body is accepted', async () => {
  const response = await postCompressed(
    'identity',
    Buffer.from(JSON.stringify(validCheckout)),
  );
  expect(response.status).toBe(201);
});

const padded = (bytes: number) =>
  JSON.stringify({ ...validCheckout, padding: 'a'.repeat(bytes) });

test('a large body under the limit is judged on its fields, not its size', async () => {
  const response = await rawCheckout(padded(15 * 1024));
  expect(response.status).toBe(400);
  expect(response.body.error).toBe('Invalid request');
});

test('checkout bodies over 16 KiB are refused with 413 before persistence', async () => {
  const response = await rawCheckout(padded(17 * 1024));
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ error: 'Invalid JSON body' });
  expect(await fixture.count('orders')).toBe(0);
});

test('webhook bodies over 16 KiB are refused with 413 before persistence', async () => {
  const order = await fixture.place();
  const response = await rawWebhook(
    JSON.stringify({
      eventId: 'oversized',
      orderId: order.id,
      outcome: 'succeeded',
      padding: 'a'.repeat(17 * 1024),
    }),
  );
  expect(response.status).toBe(413);
  expect(await fixture.count('provider_events')).toBe(0);
});

test('a small compressed body that inflates past the limit is refused with 413', async () => {
  const response = await postCompressed(
    'gzip',
    gzipSync(padded(2 * 1024 * 1024)),
  );
  expect(response.status).toBe(413);
  expect(await fixture.count('orders')).toBe(0);
});

test.each([
  ['single character reference', { businessOrderReference: 'x' }],
  ['128 character reference', { businessOrderReference: 'x'.repeat(128) }],
  ['reference with inner spaces', { businessOrderReference: 'order 1 / A' }],
  ['reference with inner tab', { businessOrderReference: 'a\tb' }],
  ['reference with inner newline', { businessOrderReference: 'a\nb' }],
  ['reference that looks numeric', { businessOrderReference: '0042' }],
  ['reference with emoji', { businessOrderReference: '🧾-😀-🧾' }],
  ['reference with right-to-left text', { businessOrderReference: 'طلب-١٢٣' }],
  ['reference with zero-width joiner', { businessOrderReference: 'a‍b' }],
  ['smallest amount', { amountMinor: '1' }],
  ['amount with nineteen digits', { amountMinor: '1000000000000000000' }],
  ['a zero-decimal currency', { currency: 'JPY' }],
  ['a three-decimal currency', { currency: 'BHD' }],
  ['a four-decimal currency', { currency: 'CLF' }],
  ['a CFA franc', { currency: 'XOF' }],
])('accepts %s and returns it unchanged', async (_name, override) => {
  const body = { ...validCheckout, ...override };
  const response = await fixture.checkout(body);
  expect(response.status).toBe(201);
  expect(response.body).toMatchObject(body);
  const read = await fixture.order(response.body.id);
  expect(read.body).toMatchObject(body);
});

test('hostile text is stored literally and never interpreted as SQL', async () => {
  const reference = `Robert'); DROP TABLE orders;-- "quoted" \\ back\\slash $1 %s`;
  const created = await fixture.checkout({
    ...validCheckout,
    businessOrderReference: reference,
  });
  expect(created.status).toBe(201);
  expect(created.body.businessOrderReference).toBe(reference);
  expect(await fixture.count('orders')).toBe(1);
  expect((await fixture.order(created.body.id)).status).toBe(200);
});

test('references are case-sensitive and not Unicode-normalized', async () => {
  const references = ['Order', 'order', 'ORDER', 'é', 'é'];
  const responses = await Promise.all(
    references.map((reference) =>
      fixture.checkout({ ...validCheckout, businessOrderReference: reference }),
    ),
  );
  expect(responses.map((response) => response.status)).toEqual(
    references.map(() => 201),
  );
  expect(new Set(responses.map((response) => response.body.id)).size).toBe(5);
  expect(
    responses.map((response) => response.body.businessOrderReference),
  ).toEqual(references);
  expect(await fixture.count('orders')).toBe(5);
});

test('a client cannot choose server-owned fields', async () => {
  const response = await fixture.checkout({ ...validCheckout, id: 'mine' });
  expect(response.status).toBe(400);
  const created = await fixture.place();
  expect(created.id).not.toBe('mine');
  expect(created.status).toBe('pending');
});

test.each([
  ['eventId', ''],
  ['eventId', 'x'.repeat(129)],
  ['eventId', ' padded'],
  ['eventId', 'padded '],
  ['eventId', 42],
  ['eventId', null],
  ['outcome', 'pending'],
  ['outcome', 'SUCCEEDED'],
  ['outcome', 'Succeeded'],
  ['outcome', 'refunded'],
  ['outcome', ''],
  ['outcome', true],
  ['orderId', 'not-a-uuid'],
  ['orderId', ''],
  ['orderId', 42],
  ['orderId', '11111111-1111-4111-8111-11111111111'],
  ['orderId', '11111111111141118111111111111111'],
])('webhook field %s rejects %j and stores nothing', async (field, value) => {
  const order = await fixture.place();
  const response = await request(fixture.app)
    .post('/webhooks/payment')
    .send({
      eventId: 'event-1',
      orderId: order.id,
      outcome: 'succeeded',
      [field]: value,
    });
  expect(response.status).toBe(400);
  expect(response.body.error).toBe('Invalid request');
  expect(await fixture.count('provider_events')).toBe(0);
});

test.each([
  [
    'missing eventId',
    { orderId: '11111111-1111-4111-8111-111111111111', outcome: 'failed' },
  ],
  ['missing orderId', { eventId: 'e', outcome: 'failed' }],
  [
    'missing outcome',
    { eventId: 'e', orderId: '11111111-1111-4111-8111-111111111111' },
  ],
  ['empty object', {}],
  [
    'unknown field',
    {
      eventId: 'e',
      orderId: '11111111-1111-4111-8111-111111111111',
      outcome: 'failed',
      amountMinor: '1',
    },
  ],
])('webhook %s is a 400', async (_name, body) => {
  const response = await request(fixture.app)
    .post('/webhooks/payment')
    .send(body);
  expect(response.status).toBe(400);
});

test.each([
  ['a NUL escape', 'a\\u0000b'],
  ['a lone high surrogate', 'a\\ud800b'],
  ['a lone low surrogate', 'a\\udc00b'],
])(
  'webhook event IDs containing %s are rejected before PostgreSQL',
  async (_name, eventId) => {
    const order = await fixture.place();
    const response = await rawWebhook(
      `{"eventId":"${eventId}","orderId":"${order.id}","outcome":"succeeded"}`,
    );
    expect(response.status).toBe(400);
    expect(await fixture.count('provider_events')).toBe(0);
  },
);

test('webhook event IDs may be 128 characters or contain emoji', async () => {
  const order = await fixture.place();
  expect((await fixture.webhook(order.id, 'e'.repeat(128))).status).toBe(200);
  expect((await fixture.webhook(order.id, '✅-😀')).status).toBe(200);
  expect(await fixture.count('provider_events')).toBe(2);
});
