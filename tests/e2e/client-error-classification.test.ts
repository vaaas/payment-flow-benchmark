import { gzipSync } from 'node:zlib';
import request from 'supertest';
import { createFixture, validCheckout } from '#tests/support/e2e-fixture';

const fixture = createFixture();

beforeAll(fixture.prepare);
beforeEach(fixture.reset);
afterAll(fixture.close);
afterEach(() => jest.restoreAllMocks());

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

const corruptBodies: [string, string, Buffer][] = [
  ['corrupt Brotli data', 'br', Buffer.from('definitely not brotli')],
  ['corrupt gzip data', 'gzip', gzipSync('x'.repeat(100)).subarray(0, 8)],
  ['non-gzip data labelled gzip', 'gzip', Buffer.from('definitely not gzip')],
  [
    'a truncated gzip stream',
    'gzip',
    gzipSync(JSON.stringify(validCheckout)).subarray(0, 12),
  ],
  ['non-deflate data labelled deflate', 'deflate', Buffer.from('not deflate')],
  ['an empty gzip body', 'gzip', Buffer.alloc(0)],
];

test.each(corruptBodies)(
  '%s is a 400 client error, not a 503 processing failure',
  async (_name, encoding, body) => {
    const serverErrors = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const response = await postCompressed(encoding, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
    expect(serverErrors).not.toHaveBeenCalled();
    expect(await fixture.count('orders')).toBe(0);
  },
);

test.each(corruptBodies)(
  'webhooks treat %s as a 400 client error too',
  async (_name, encoding, body) => {
    const serverErrors = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const server = await fixture.serve();
    try {
      const response = await fetch(`${server.url}/webhooks/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': encoding,
        },
        body: new Uint8Array(body),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
    } finally {
      await server.stop();
    }
    expect(serverErrors).not.toHaveBeenCalled();
  },
);

test.each([
  '/orders/%zz',
  '/orders/%',
  '/orders/%E0%A4%A',
  '/orders/%ff%fe',
  '/orders/11111111-1111-4111-8111-11111111111%',
])(
  'a malformed percent-encoded path %s is a 400 client error, not a 503 processing failure',
  async (path) => {
    const serverErrors = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const response = await request(fixture.app)
      .get(path)
      .set('Authorization', fixture.authorization);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request' });
    expect(serverErrors).not.toHaveBeenCalled();
    serverErrors.mockRestore();
  },
);

test('percent-encoded identifiers that decode to a valid UUID are accepted', async () => {
  const order = await fixture.place();
  const encoded = order.id.replace(/-/g, '%2D');
  const response = await fixture.order(encoded);
  expect(response.status).toBe(200);
  expect(response.body.id).toBe(order.id);
});
