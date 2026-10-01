import type { Checkout } from '#src/checkout/domain/create-checkout';
import type { ProviderEvent } from '#src/payments/domain/receive-webhook';
import type { Order } from '#src/orders/domain/order';

export interface OrderStore {
  create(payload: Checkout): Promise<{ order: Order; created: boolean }>;
  receive(payload: ProviderEvent): Promise<{ duplicate: boolean }>;
  get(id: string): Promise<Order>;
}
