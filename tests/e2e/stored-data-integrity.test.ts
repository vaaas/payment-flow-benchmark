import { randomUUID } from 'node:crypto';
import { createFixture } from '#tests/support/e2e-fixture';

const fixture = createFixture({ schema: 'stored_data_integrity_test' });

beforeAll(fixture.prepare);
beforeEach(fixture.reset);
afterAll(fixture.close);
afterEach(() => jest.restoreAllMocks());

const insertStoredOrder = async (status: string) => {
  const publicId = randomUUID();
  await fixture.pool.query(
    `INSERT INTO orders (public_id, business_order_reference, amount_minor, currency, status)
     VALUES ($1, $2, 1999, 'EUR', $3)`,
    [publicId, `stored-${publicId}`, status],
  );
  return publicId;
};

test.each(['pending', 'failed', 'succeeded'])(
  'a stored order with status %s is served unchanged',
  async (status) => {
    const id = await insertStoredOrder(status);
    const response = await fixture.order(id);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe(status);
  },
);

test.each(['refunded', 'PENDING', 'Succeeded', '', 'cancelled'])(
  'a stored order with the unknown status %j is a processing failure, never served',
  async (status) => {
    const serverErrors = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const id = await insertStoredOrder(status);
    const read = await fixture.order(id);
    const paid = await fixture.webhook(id, 'evt-1');
    expect(read.status).toBe(503);
    expect(read.body).toEqual({
      error: 'Processing failed; retry the identical request',
    });
    expect(paid.status).toBe(503);
    expect(serverErrors).toHaveBeenCalled();
    const stored = await fixture.pool.query('SELECT status FROM orders');
    expect(stored.rows).toEqual([{ status }]);
    expect(await fixture.count('provider_events')).toBe(0);
  },
);

test('a checkout retry against an order with an unknown stored status is a processing failure', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const id = await insertStoredOrder('refunded');
  const reference = (
    await fixture.pool.query(
      'SELECT business_order_reference AS reference FROM orders WHERE public_id = $1',
      [id],
    )
  ).rows[0].reference;
  const response = await fixture.checkout({
    businessOrderReference: reference,
    amountMinor: '1999',
    currency: 'EUR',
  });
  expect(response.status).toBe(503);
});
