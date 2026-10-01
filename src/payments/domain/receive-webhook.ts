export type PaymentOutcome = 'failed' | 'succeeded';

export type ProviderEvent = Readonly<{
  eventId: string;
  orderId: string;
  outcome: PaymentOutcome;
}>;

export class ReceiveWebhook {
  public readonly payload: ProviderEvent;

  constructor(payload: ProviderEvent) {
    this.payload = Object.freeze({ ...payload });
    Object.freeze(this);
  }
}
