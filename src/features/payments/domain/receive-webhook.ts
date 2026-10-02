import { Event } from '#src/application/event';
import { z } from 'zod';
import { identifierSchema } from '#src/shared/domain/identifier-schema';

export type PaymentOutcome = 'failed' | 'succeeded';

export type ProviderEvent = Readonly<{
  eventId: string;
  orderId: string;
  outcome: PaymentOutcome;
}>;

export type WebhookReceipt = Readonly<{ duplicate: boolean }>;

export class ReceiveWebhook extends Event<WebhookReceipt> {
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
