import type { Checkout } from '#src/checkout/domain/create-checkout';
import type { ProviderEvent } from '#src/payments/domain/receive-webhook';
import type { Order } from '#src/orders/domain/order';

export abstract class OrderStore {
  abstract create(
    payload: Checkout,
  ): Promise<{ order: Order; created: boolean }>;
  abstract receive(payload: ProviderEvent): Promise<{ duplicate: boolean }>;
  abstract get(id: string): Promise<Order>;
}
