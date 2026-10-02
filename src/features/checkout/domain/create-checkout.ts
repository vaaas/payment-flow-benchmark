import { Event } from '#src/application/event';
import type { Order } from '#src/features/orders/domain/order';
import { z } from 'zod';
import { BusinessOrderReference } from '#src/features/checkout/domain/business-order-reference';
import { Amount } from '#src/shared/domain/amount';
import { Currency } from '#src/shared/domain/currency';

export type Checkout = Readonly<{
  businessOrderReference: BusinessOrderReference;
  amountMinor: Amount;
  currency: Currency;
}>;

export type CheckoutResult = Readonly<{ order: Order; created: boolean }>;

export class CreateCheckout extends Event<CheckoutResult> {
  private static readonly schema = z.strictObject({
    businessOrderReference: BusinessOrderReference.schema,
    amountMinor: Amount.schema,
    currency: Currency.schema,
  });

  public static from(input: unknown): CreateCheckout {
    return new CreateCheckout(CreateCheckout.schema.parse(input));
  }

  public readonly payload: Checkout;

  private constructor(payload: Checkout) {
    super();
    this.payload = Object.freeze({ ...payload });
    Object.freeze(this);
  }
}
