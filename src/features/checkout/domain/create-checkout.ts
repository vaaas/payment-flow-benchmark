import { Event } from '#src/application/event';
import type { Order } from '#src/features/orders/domain/order';
import { z } from 'zod';
import { BusinessOrderReference } from '#src/features/checkout/domain/business-order-reference';
import { IdempotencyKey } from '#src/features/checkout/domain/idempotency-key';
import { Currency } from '#src/shared/domain/currency';

export type Checkout = Readonly<{
  businessOrderReference: BusinessOrderReference;
  amountMinor: string;
  currency: Currency;
}>;

export type CheckoutResult = Readonly<{ order: Order; created: boolean }>;

export class CreateCheckout extends Event<CheckoutResult> {
  private static readonly schema = z.strictObject({
    businessOrderReference: BusinessOrderReference.schema,
    amountMinor: z
      .string()
      .regex(/^[1-9][0-9]{0,18}$/)
      .pipe(
        z.string().refine((value) => BigInt(value) <= 9223372036854775807n),
      ),
    currency: Currency.schema,
  });

  public static from(input: unknown, idempotencyKey?: unknown): CreateCheckout {
    return new CreateCheckout(
      CreateCheckout.schema.parse(input),
      IdempotencyKey.schema.optional().parse(idempotencyKey),
    );
  }

  public readonly payload: Checkout;

  private constructor(
    payload: Checkout,
    public readonly idempotencyKey: IdempotencyKey | undefined,
  ) {
    super();
    this.payload = Object.freeze({ ...payload });
    Object.freeze(this);
  }
}
