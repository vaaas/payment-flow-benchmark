import type { Checkout } from '../../checkout/domain/create-checkout';
import type { ProviderEvent } from '../../payments/domain/receive-webhook';
import type { Order } from './order';

export interface OrderStore {
  create(payload: Checkout): Promise<{ order: Order; created: boolean }>;
  receive(payload: ProviderEvent): Promise<{ duplicate: boolean }>;
  get(id: string): Promise<Order>;
}
