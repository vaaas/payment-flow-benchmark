import type { BusinessOrderReference } from '#src/features/checkout/domain/business-order-reference';
import type { IdempotencyKey } from '#src/features/checkout/domain/idempotency-key';
import type { OrderId } from '#src/features/orders/domain/order-id';
import type { Checkout } from '#src/features/checkout/domain/create-checkout';
import type { Order } from '#src/features/orders/domain/order';

export interface CheckoutSession {
  lockSubmission(key: IdempotencyKey): Promise<void>;
  findBySubmission(key: IdempotencyKey): Promise<Order | undefined>;
  insertIfAbsent(checkout: Checkout): Promise<Order | undefined>;
  findByReference(
    businessOrderReference: BusinessOrderReference,
  ): Promise<Order | undefined>;
  bindSubmission(key: IdempotencyKey, orderId: OrderId): Promise<void>;
}

export abstract class CheckoutStore {
  abstract transaction<T>(
    work: (session: CheckoutSession) => Promise<T>,
  ): Promise<T>;
}
