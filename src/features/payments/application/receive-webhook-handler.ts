import type { Container } from '#src/application/dependency-injection/container';
import type { EventHandler } from '#src/application/event-handler';
import type { ReceiveWebhook } from '#src/features/payments/domain/receive-webhook';
import { OrderStore } from '#src/features/orders/domain/order-store';

export class ReceiveWebhookHandler implements EventHandler<ReceiveWebhook> {
  public static provide(container: Container): ReceiveWebhookHandler {
    return new ReceiveWebhookHandler(container.get(OrderStore));
  }

  constructor(private readonly store: OrderStore) {}

  public handle(event: ReceiveWebhook) {
    return this.store.receive(event.payload);
  }
}
