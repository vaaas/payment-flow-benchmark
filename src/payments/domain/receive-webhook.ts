import { Event } from '#src/application/event';
import type { OrderStore } from '#src/orders/domain/order-store';
import { z } from 'zod';
import { identifierSchema } from '#src/shared/domain/identifier-schema';

export type PaymentOutcome = 'failed' | 'succeeded';

export type ProviderEvent = Readonly<{
  eventId: string;
  orderId: string;
  outcome: PaymentOutcome;
}>;

export class ReceiveWebhook extends Event<
  Awaited<ReturnType<OrderStore['receive']>>
> {
  private static readonly schema = z.strictObject({
    eventId: identifierSchema,
    orderId: z.uuid(),
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
