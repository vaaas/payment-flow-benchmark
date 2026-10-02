import { Event } from '#src/application/event';
import { z } from 'zod';
import { OrderId } from '#src/features/orders/domain/order-id';
import { ProviderEventId } from '#src/features/payments/domain/provider-event-id';

export type PaymentOutcome = 'failed' | 'succeeded';

export type ProviderEvent = Readonly<{
  eventId: ProviderEventId;
  orderId: OrderId;
  outcome: PaymentOutcome;
}>;

export type WebhookReceipt = Readonly<{ duplicate: boolean }>;

export class ReceiveWebhook extends Event<WebhookReceipt> {
  private static readonly schema = z.strictObject({
    eventId: ProviderEventId.schema,
    orderId: OrderId.schema,
    outcome: z.enum(['failed', 'succeeded']),
  });

  public static from(input: unknown): ReceiveWebhook {
    return new ReceiveWebhook(ReceiveWebhook.schema.parse(input));
  }

  public readonly payload: ProviderEvent;

  private constructor(payload: ProviderEvent) {
    super();
    this.payload = Object.freeze({ ...payload });
    Object.freeze(this);
  }
}
