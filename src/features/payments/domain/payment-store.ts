import type { OrderId } from '#src/features/orders/domain/order-id';
import type { ProviderEventId } from '#src/features/payments/domain/provider-event-id';
import type { Order, PaymentStatus } from '#src/features/orders/domain/order';
import type { ProviderEvent } from '#src/features/payments/domain/receive-webhook';

export interface PaymentSession {
  lockOrder(orderId: OrderId): Promise<Order | undefined>;
  insertEvent(event: ProviderEvent): Promise<boolean>;
  findEvent(eventId: ProviderEventId): Promise<ProviderEvent | undefined>;
  updateStatus(orderId: OrderId, status: PaymentStatus): Promise<void>;
}

export abstract class PaymentStore {
  abstract transaction<T>(
    work: (session: PaymentSession) => Promise<T>,
  ): Promise<T>;
}
