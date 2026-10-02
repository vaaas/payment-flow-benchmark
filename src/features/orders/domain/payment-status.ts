import { z } from 'zod';

export const paymentStatusSchema = z.enum(['pending', 'failed', 'succeeded']);

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentOutcomeSchema = z.enum(['failed', 'succeeded']);

export type PaymentOutcome = z.infer<typeof paymentOutcomeSchema>;

export const paymentTransitions = {
  pending: { failed: 'failed', succeeded: 'succeeded' },
  failed: { failed: 'failed', succeeded: 'succeeded' },
  succeeded: { failed: 'succeeded', succeeded: 'succeeded' },
} as const satisfies Record<
  PaymentStatus,
  Record<PaymentOutcome, PaymentStatus>
>;

export function nextPaymentStatus(
  status: PaymentStatus,
  outcome: PaymentOutcome,
): PaymentStatus {
  return paymentTransitions[status][outcome];
}

export function foldPaymentStatus(
  outcomes: Iterable<PaymentOutcome>,
  from: PaymentStatus = 'pending',
): PaymentStatus {
  let status = from;
  for (const outcome of outcomes) status = nextPaymentStatus(status, outcome);
  return status;
}
