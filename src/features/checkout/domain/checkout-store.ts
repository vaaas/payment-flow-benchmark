import type { Checkout } from '#src/features/checkout/domain/create-checkout';
import type { Order } from '#src/features/orders/domain/order';

export interface CheckoutSession {
  lockSubmission(key: string): Promise<void>;
  findBySubmission(key: string): Promise<Order | undefined>;
  insertIfAbsent(checkout: Checkout): Promise<Order | undefined>;
  findByReference(businessOrderReference: string): Promise<Order | undefined>;
  bindSubmission(key: string, orderId: string): Promise<void>;
}

export abstract class CheckoutStore {
  abstract transaction<T>(
    work: (session: CheckoutSession) => Promise<T>,
  ): Promise<T>;
}
