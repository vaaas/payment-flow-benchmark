import { createFixture, validCheckout } from '#tests/support/e2e-fixture';

const fixture = createFixture();

beforeAll(fixture.prepare);
beforeEach(fixture.reset);
afterAll(fixture.close);

const range = (length: number) => Array.from({ length }, (_, index) => index);

test('many distinct orders created at once all succeed with unique identifiers', async () => {
  const responses = await Promise.all(
    range(60).map((index) =>
      fixture.checkout({
        ...validCheckout,
        businessOrderReference: `bulk-${index}`,
        amountMinor: String(index + 1),
      }),
    ),
  );
  expect(responses.every((response) => response.status === 201)).toBe(true);
  expect(new Set(responses.map((response) => response.body.id)).size).toBe(60);
  expect(await fixture.count('orders')).toBe(60);
  for (const [index, response] of responses.entries())
    expect(response.body.amountMinor).toBe(String(index + 1));
});

test('payments for many orders in parallel settle each order independently', async () => {
  const orders = await Promise.all(
    range(40).map((index) => fixture.place(`parallel-${index}`)),
  );
  const outcomes = orders.map((_, index) =>
    index % 3 === 0 ? 'failed' : 'succeeded',
  );
  const responses = await Promise.all(
    orders.map((order, index) =>
      fixture.webhook(order.id, `event-${index}`, outcomes[index]),
    ),
  );
  expect(responses.every((response) => response.status === 200)).toBe(true);
  const settled = await Promise.all(
    orders.map((order) => fixture.order(order.id)),
  );
  expect(settled.map((response) => response.body.status)).toEqual(outcomes);
  expect(await fixture.count('provider_events')).toBe(40);
});

test('more simultaneous requests than pooled connections are queued rather than failed', async () => {
  const order = await fixture.place();
  const responses = await Promise.all(
    range(150).map((index) =>
      index % 3 === 0
        ? fixture.checkout({
            ...validCheckout,
            businessOrderReference: `queued-${index}`,
          })
        : fixture.order(order.id),
    ),
  );
  for (const [index, response] of responses.entries())
    expect(response.status).toBe(index % 3 === 0 ? 201 : 200);
});

test('independent create-then-pay flows interleave without losing a write', async () => {
  const flows = await Promise.all(
    range(15).map(async (index) => {
      const order = await fixture.place(`flow-${index}`);
      await fixture.webhook(order.id, `flow-event-${index}`);
      const read = await fixture.order(order.id);
      return read.body.status;
    }),
  );
  expect(flows.every((status) => status === 'succeeded')).toBe(true);
});

test('readers racing with writers see only legal states and never a regression after success', async () => {
  const order = await fixture.place();
  let writing = true;
  const observed: string[] = [];
  const reader = (async () => {
    while (writing) {
      const response = await fixture.order(order.id);
      observed.push(response.body.status);
    }
  })();
  await Promise.all(
    range(40).map((index) =>
      fixture.webhook(
        order.id,
        `event-${index}`,
        index % 4 === 3 ? 'succeeded' : 'failed',
      ),
    ),
  );
  writing = false;
  await reader;
  const firstSuccess = observed.indexOf('succeeded');
  expect(
    observed.every((status) =>
      ['pending', 'failed', 'succeeded'].includes(status),
    ),
  ).toBe(true);
  if (firstSuccess >= 0)
    expect(
      observed.slice(firstSuccess).every((status) => status === 'succeeded'),
    ).toBe(true);
  const firstSettled = observed.findIndex((status) => status !== 'pending');
  if (firstSettled >= 0)
    expect(observed.slice(firstSettled)).not.toContain('pending');
  expect((await fixture.order(order.id)).body.status).toBe('succeeded');
});

test('mixed checkouts, replays, payments and lookups complete without deadlock or error', async () => {
  const seeded = await Promise.all(
    range(10).map((index) => fixture.place(`seed-${index}`)),
  );
  const operations = range(120).map((index) => {
    const target = seeded[index % seeded.length];
    if (!target) throw new Error('Expected a seeded order');
    switch (index % 4) {
      case 0:
        return fixture.checkout({
          ...validCheckout,
          businessOrderReference: target.businessOrderReference,
        });
      case 1:
        return fixture.webhook(
          target.id,
          `mixed-${index}`,
          index % 8 === 1 ? 'failed' : 'succeeded',
        );
      case 2:
        return fixture.checkout({
          ...validCheckout,
          businessOrderReference: `fresh-${index}`,
        });
      default:
        return fixture.order(target.id);
    }
  });
  const responses = await Promise.all(operations);
  expect(
    responses
      .map((response) => response.status)
      .filter((status) => ![200, 201].includes(status)),
  ).toEqual([]);
  expect(await fixture.count('orders')).toBe(10 + 30);
});

test('replaying one event many times alongside new events keeps the event log exact', async () => {
  const order = await fixture.place();
  const responses = await Promise.all(
    range(60).map((index) =>
      fixture.webhook(
        order.id,
        index % 2 === 0 ? 'repeated' : `unique-${index}`,
        'succeeded',
      ),
    ),
  );
  expect(responses.every((response) => response.status === 200)).toBe(true);
  expect(responses.filter((response) => !response.body.duplicate)).toHaveLength(
    31,
  );
  expect(await fixture.count('provider_events')).toBe(31);
});

test('conflicting payloads for many references each have exactly one winner', async () => {
  const references = range(8).map((index) => `contested-${index}`);
  const responses = await Promise.all(
    references.flatMap((reference) =>
      range(6).map((attempt) =>
        fixture.checkout({
          businessOrderReference: reference,
          amountMinor: String(100 + (attempt % 2)),
          currency: 'EUR',
        }),
      ),
    ),
  );
  expect(responses.filter((response) => response.status === 201)).toHaveLength(
    8,
  );
  expect(
    responses.filter((response) => response.status === 409).length,
  ).toBeGreaterThan(0);
  expect(
    responses.every((response) => [200, 201, 409].includes(response.status)),
  ).toBe(true);
  expect(await fixture.count('orders')).toBe(8);
});
