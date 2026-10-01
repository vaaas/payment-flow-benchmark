import type { Checkout } from '#src/checkout/domain/create-checkout';
import type { PaymentOutcome } from '#src/payments/domain/receive-webhook';

export type PaymentStatus = 'pending' | PaymentOutcome;

export type OrderSnapshot = Checkout &
  Readonly<{
    id: string;
    status: PaymentStatus;
    createdAt: string;
    updatedAt: string;
  }>;

export class Order implements OrderSnapshot {
  public readonly id: string;
  public readonly businessOrderReference: string;
  public readonly amountMinor: string;
  public readonly currency: string;
  public readonly status: PaymentStatus;
  public readonly createdAt: string;
  public readonly updatedAt: string;

  constructor(snapshot: OrderSnapshot) {
    this.id = snapshot.id;
    this.businessOrderReference = snapshot.businessOrderReference;
    this.amountMinor = snapshot.amountMinor;
    this.currency = snapshot.currency;
    this.status = snapshot.status;
    this.createdAt = snapshot.createdAt;
    this.updatedAt = snapshot.updatedAt;
    Object.freeze(this);
  }

  matchesCheckout(checkout: Checkout): boolean {
    return (
      this.businessOrderReference === checkout.businessOrderReference &&
      this.amountMinor === checkout.amountMinor &&
      this.currency === checkout.currency
    );
  }

  paymentStatusAfter(outcome: PaymentOutcome): PaymentStatus {
    return this.status === 'succeeded' ? this.status : outcome;
  }
}
