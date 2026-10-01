import { CreateCheckout } from '#src/checkout/domain/create-checkout';
import { ReceiveWebhook } from '#src/payments/domain/receive-webhook';
import type { OrderStore } from '#src/orders/domain/order-store';

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
