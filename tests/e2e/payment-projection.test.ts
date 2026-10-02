import { foldPaymentStatus } from '#src/features/orders/domain/payment-status';
import type { PaymentOutcome } from '#src/features/orders/domain/payment-status';
import { createFixture } from '#tests/support/e2e-fixture';

const fixture = createFixture();

beforeAll(fixture.prepare);
beforeEach(fixture.reset);
afterAll(fixture.close);

const outcomes: PaymentOutcome[] = ['failed', 'succeeded'];

const sequencesUpTo = (maxLength: number): PaymentOutcome[][] => {
  const all: PaymentOutcome[][] = [];
  let current: PaymentOutcome[][] = [[]];
  for (let length = 1; length <= maxLength; length++) {
    current = current.flatMap((prefix) =>
      outcomes.map((outcome) => [...prefix, outcome]),
    );
    all.push(...current);
  }
  return all;
};

type Projection = { publicId: string; status: string; history: string[] };

const projections = async (): Promise<Projection[]> => {
  const result = await fixture.pool.query(
    `SELECT o.public_id AS "publicId", o.status,
            COALESCE(array_agg(e.outcome ORDER BY e.id) FILTER (WHERE e.id IS NOT NULL), '{}') AS history
     FROM orders o LEFT JOIN provider_events e ON e.order_id = o.id
     GROUP BY o.id ORDER BY o.id`,
  );
  return result.rows;
};

const expectEveryStatusToEqualItsFold = async () => {
  const rows = await projections();
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows)
    expect([row.publicId, row.status]).toEqual([
      row.publicId,
      foldPaymentStatus(row.history as PaymentOutcome[]),
    ]);
};

test('an order with no events is pending, the fold of an empty history', async () => {
  await fixture.place();
  await expectEveryStatusToEqualItsFold();
  expect((await projections())[0]?.status).toBe('pending');
});

test('every delivery order of up to four events projects to the fold of its stored events', async () => {
  const sequences = sequencesUpTo(4);
  await Promise.all(
    sequences.map(async (sequence, index) => {
      const order = await fixture.place(`sequence-${index}`);
      for (const [step, outcome] of sequence.entries())
        await fixture.webhook(order.id, `event-${index}-${step}`, outcome);
    }),
  );
  expect((await projections()).length).toBe(sequences.length);
  await expectEveryStatusToEqualItsFold();
});

test('concurrent deliveries for one order project to the fold of whatever was stored', async () => {
  const order = await fixture.place();
  await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      fixture.webhook(
        order.id,
        `event-${index}`,
        index % 5 === 0 ? 'succeeded' : 'failed',
      ),
    ),
  );
  await expectEveryStatusToEqualItsFold();
  const [row] = await projections();
  expect(row?.history).toHaveLength(40);
  expect(row?.status).toBe('succeeded');
});

test('redeliveries and conflicting replays never break the projection', async () => {
  const order = await fixture.place();
  await fixture.webhook(order.id, 'event-1', 'failed');
  await fixture.webhook(order.id, 'event-1', 'failed');
  await fixture.webhook(order.id, 'event-1', 'succeeded');
  await expectEveryStatusToEqualItsFold();
  expect((await projections())[0]).toMatchObject({
    status: 'failed',
    history: ['failed'],
  });
  await fixture.webhook(order.id, 'event-2', 'succeeded');
  await fixture.webhook(order.id, 'event-3', 'failed');
  await expectEveryStatusToEqualItsFold();
  expect((await projections())[0]?.history).toEqual([
    'failed',
    'succeeded',
    'failed',
  ]);
});

test('the projection can be rebuilt from the event log alone', async () => {
  const sequences = sequencesUpTo(3);
  await Promise.all(
    sequences.map(async (sequence, index) => {
      const order = await fixture.place(`rebuild-${index}`);
      for (const [step, outcome] of sequence.entries())
        await fixture.webhook(order.id, `rebuild-${index}-${step}`, outcome);
    }),
  );
  const before = await projections();
  await fixture.pool.query("UPDATE orders SET status = 'pending'");
  for (const row of before) {
    await fixture.pool.query(
      'UPDATE orders SET status = $1 WHERE public_id = $2',
      [foldPaymentStatus(row.history as PaymentOutcome[]), row.publicId],
    );
  }
  expect(await projections()).toEqual(before);
});
