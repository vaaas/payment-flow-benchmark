import type { Order, PaymentStatus } from '#src/features/orders/domain/order';
import type { ProviderEvent } from '#src/features/payments/domain/receive-webhook';

export interface PaymentSession {
  lockOrder(orderId: string): Promise<Order | undefined>;
  insertEvent(event: ProviderEvent): Promise<boolean>;
  findEvent(eventId: string): Promise<ProviderEvent | undefined>;
  updateStatus(orderId: string, status: PaymentStatus): Promise<void>;
}

export abstract class PaymentStore {
  abstract transaction<T>(
    work: (session: PaymentSession) => Promise<T>,
  ): Promise<T>;
}
