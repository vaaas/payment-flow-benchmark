import type { Checkout } from '#src/features/checkout/domain/create-checkout';
import type { ProviderEvent } from '#src/features/payments/domain/receive-webhook';
import type { Order } from '#src/features/orders/domain/order';

export abstract class OrderStore {
  abstract create(
    payload: Checkout,
  ): Promise<{ order: Order; created: boolean }>;
  abstract receive(payload: ProviderEvent): Promise<{ duplicate: boolean }>;
  abstract get(id: string): Promise<Order>;
}
