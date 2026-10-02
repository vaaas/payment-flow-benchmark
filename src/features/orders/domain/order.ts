import { z } from 'zod';
import type { BusinessOrderReference } from '#src/features/checkout/domain/business-order-reference';
import type { OrderId } from '#src/features/orders/domain/order-id';
import type { Amount } from '#src/shared/domain/amount';
import type { Currency } from '#src/shared/domain/currency';
import type { Checkout } from '#src/features/checkout/domain/create-checkout';
import type { PaymentOutcome } from '#src/features/payments/domain/receive-webhook';

export const paymentStatusSchema = z.enum(['pending', 'failed', 'succeeded']);

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export type OrderSnapshot = Checkout &
  Readonly<{
    id: OrderId;
    status: PaymentStatus;
    createdAt: string;
    updatedAt: string;
  }>;

export class Order implements OrderSnapshot {
  public readonly id: OrderId;
  public readonly businessOrderReference: BusinessOrderReference;
  public readonly amountMinor: Amount;
  public readonly currency: Currency;
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
      this.amountMinor.equals(checkout.amountMinor) &&
      this.currency.equals(checkout.currency)
    );
  }

  paymentStatusAfter(outcome: PaymentOutcome): PaymentStatus {
    return this.status === 'succeeded' ? this.status : outcome;
  }
}
