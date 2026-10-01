export type PaymentStatus = 'pending' | 'failed' | 'succeeded';
export type Checkout = Readonly<{
  businessOrderReference: string;
  amountMinor: string;
  currency: string;
}>;
export type ProviderEvent = Readonly<{
  eventId: string;
  orderId: string;
  outcome: 'failed' | 'succeeded';
}>;
export type Order = Checkout &
  Readonly<{
    id: string;
    status: PaymentStatus;
    createdAt: Date;
    updatedAt: Date;
  }>;
export function nextStatus(
  current: PaymentStatus,
  outcome: ProviderEvent['outcome'],
): PaymentStatus {
  return current === 'succeeded' ? current : outcome;
}
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export class CreateCheckout {
  constructor(public readonly payload: Checkout) {}
}
export class ReceiveWebhook {
  constructor(public readonly payload: ProviderEvent) {}
}
export class GetOrder {
  constructor(public readonly id: string) {}
}
export interface OrderStore {
  create(payload: Checkout): Promise<{ order: Order; created: boolean }>;
  receive(payload: ProviderEvent): Promise<{ duplicate: boolean }>;
  get(id: string): Promise<Order>;
}
export class CommandBus {
  constructor(private readonly store: OrderStore) {}
  dispatch(command: CreateCheckout): ReturnType<OrderStore['create']>;
  dispatch(command: ReceiveWebhook): ReturnType<OrderStore['receive']>;
  dispatch(command: CreateCheckout | ReceiveWebhook) {
    return command instanceof CreateCheckout
      ? this.store.create(command.payload)
      : this.store.receive(command.payload);
  }
}
export class QueryBus {
  constructor(private readonly store: OrderStore) {}
  dispatch(query: GetOrder) {
    return this.store.get(query.id);
  }
}
