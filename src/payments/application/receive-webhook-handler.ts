import type { EventHandler } from '#src/application/event-handler';
import type { ReceiveWebhook } from '#src/payments/domain/receive-webhook';
import type { OrderStore } from '#src/orders/domain/order-store';

export class ReceiveWebhookHandler implements EventHandler<ReceiveWebhook> {
  constructor(private readonly store: OrderStore) {}

  public handle(event: ReceiveWebhook) {
    return this.store.receive(event.payload);
  }
}
