import type { BusinessOrderReference } from '#src/features/checkout/domain/business-order-reference';
import type { Order } from '#src/features/orders/domain/order';

export interface CheckoutSession {
  insertIfAbsent(order: Order): Promise<boolean>;
  findByReference(
    businessOrderReference: BusinessOrderReference,
  ): Promise<Order | undefined>;
}

export abstract class CheckoutStore {
  abstract transaction<T>(
    work: (session: CheckoutSession) => Promise<T>,
  ): Promise<T>;
}
