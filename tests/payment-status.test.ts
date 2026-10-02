import {
  foldPaymentStatus,
  nextPaymentStatus,
  paymentOutcomeSchema,
  paymentStatusSchema,
  paymentTransitions,
} from '#src/features/orders/domain/payment-status';
import type {
  PaymentOutcome,
  PaymentStatus,
} from '#src/features/orders/domain/payment-status';

const statuses = paymentStatusSchema.options;
const outcomes = paymentOutcomeSchema.options;
const rank: Record<PaymentStatus, number> = {
  pending: 0,
  failed: 1,
  succeeded: 2,
};

const sequencesUpTo = (maxLength: number): PaymentOutcome[][] => {
  const all: PaymentOutcome[][] = [[]];
  let current: PaymentOutcome[][] = [[]];
  for (let length = 1; length <= maxLength; length++) {
    current = current.flatMap((prefix) =>
      outcomes.map((outcome) => [...prefix, outcome]),
    );
    all.push(...current);
  }
  return all;
};

const permutations = <T>(items: T[]): T[][] =>
  items.length <= 1
    ? [items]
    : items.flatMap((item, index) =>
        permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
          (rest) => [item, ...rest],
        ),
      );

test('the declared transitions are exactly the allowed ones', () => {
  const changes = statuses.flatMap((from) =>
    outcomes
      .map((outcome) => [from, nextPaymentStatus(from, outcome)] as const)
      .filter(([, to]) => to !== from),
  );
  expect(changes).toEqual([
    ['pending', 'failed'],
    ['pending', 'succeeded'],
    ['failed', 'succeeded'],
  ]);
});

test('every status handles every outcome', () => {
  expect(Object.keys(paymentTransitions).sort()).toEqual([...statuses].sort());
  for (const status of statuses)
    expect(Object.keys(paymentTransitions[status]).sort()).toEqual(
      [...outcomes].sort(),
    );
});

test.each(outcomes)('succeeded is absorbing for %s', (outcome) => {
  expect(nextPaymentStatus('succeeded', outcome)).toBe('succeeded');
});

test.each(statuses)(
  'repeating an outcome in %s is a no-op after the first',
  (status) => {
    for (const outcome of outcomes) {
      const once = nextPaymentStatus(status, outcome);
      expect(nextPaymentStatus(once, outcome)).toBe(once);
    }
  },
);

test('no transition moves a status down', () => {
  for (const status of statuses)
    for (const outcome of outcomes)
      expect(rank[nextPaymentStatus(status, outcome)]).toBeGreaterThanOrEqual(
        rank[status],
      );
});

test('an empty history leaves an order pending', () => {
  expect(foldPaymentStatus([])).toBe('pending');
});

test('the fold equals the highest outcome seen', () => {
  for (const sequence of sequencesUpTo(6)) {
    const expected = sequence.reduce<PaymentStatus>(
      (highest, outcome) => (rank[outcome] > rank[highest] ? outcome : highest),
      'pending',
    );
    expect(foldPaymentStatus(sequence)).toBe(expected);
  }
});

test('the fold does not depend on arrival order', () => {
  for (const sequence of sequencesUpTo(5)) {
    const expected = foldPaymentStatus(sequence);
    for (const arrangement of permutations(sequence))
      expect(foldPaymentStatus(arrangement)).toBe(expected);
  }
});

test('redelivering any event leaves the result unchanged', () => {
  for (const sequence of sequencesUpTo(5)) {
    const expected = foldPaymentStatus(sequence);
    expect(foldPaymentStatus([...sequence, ...sequence])).toBe(expected);
    for (const outcome of sequence)
      expect(foldPaymentStatus([...sequence, outcome])).toBe(expected);
  }
});

test('folding in stages equals folding everything at once', () => {
  for (const sequence of sequencesUpTo(5))
    for (let split = 0; split <= sequence.length; split++) {
      const head = foldPaymentStatus(sequence.slice(0, split));
      expect(foldPaymentStatus(sequence.slice(split), head)).toBe(
        foldPaymentStatus(sequence),
      );
    }
});

test('once succeeded, no later history can change the result', () => {
  for (const sequence of sequencesUpTo(5))
    expect(foldPaymentStatus([...sequence, 'succeeded', ...sequence])).toBe(
      'succeeded',
    );
});
