import { CreateCheckout } from '../checkout/domain/create-checkout';
import { ReceiveWebhook } from '../payments/domain/receive-webhook';
import type { OrderStore } from '../orders/domain/order-store';

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
