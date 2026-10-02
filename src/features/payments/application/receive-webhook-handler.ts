import type { Container } from '#src/application/dependency-injection/container';
import type { EventHandler } from '#src/application/event-handler';
import { Clock } from '#src/shared/domain/clock';
import { OrderNotFound } from '#src/features/orders/domain/order-not-found';
import { PaymentStore } from '#src/features/payments/domain/payment-store';
import { ProviderEventConflict } from '#src/features/payments/domain/provider-event-conflict';
import type {
  ReceiveWebhook,
  WebhookReceipt,
} from '#src/features/payments/domain/receive-webhook';

export class ReceiveWebhookHandler implements EventHandler<ReceiveWebhook> {
  public static provide(container: Container): ReceiveWebhookHandler {
    return new ReceiveWebhookHandler(
      container.get(PaymentStore),
      container.get(Clock),
    );
  }

  constructor(
    private readonly store: PaymentStore,
    private readonly clock: Clock,
  ) {}

  public handle(event: ReceiveWebhook): Promise<WebhookReceipt> {
    const { eventId, outcome } = event.payload;
    return this.store.transaction(async (session) => {
      const order = await session.lockOrder(event.payload.orderId);
      if (!order) throw new OrderNotFound();
      const received = { eventId, orderId: order.id, outcome };
      if (!(await session.insertEvent(received))) {
        const existing = await session.findEvent(eventId);
        if (!existing)
          throw new Error('Provider event disappeared during processing');
        if (existing.orderId !== order.id || existing.outcome !== outcome)
          throw new ProviderEventConflict();
        return { duplicate: true };
      }
      const status = order.paymentStatusAfter(outcome);
      if (status !== order.status)
        await session.updateStatus(order.id, status, this.clock.now());
      return { duplicate: false };
    });
  }
}
