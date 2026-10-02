import { Event } from '#src/application/event';
import type { OrderStore } from '#src/features/orders/domain/order-store';
import { z } from 'zod';
import { Currency } from '#src/shared/domain/currency';
import { identifierSchema } from '#src/shared/domain/identifier-schema';

export type Checkout = Readonly<{
  businessOrderReference: string;
  amountMinor: string;
  currency: Currency;
}>;

export class CreateCheckout extends Event<
  Awaited<ReturnType<OrderStore['create']>>
> {
  private static readonly schema = z.strictObject({
    businessOrderReference: identifierSchema,
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
      identifierSchema.optional().parse(idempotencyKey),
    );
  }

  public readonly payload: Checkout;

  private constructor(
    payload: Checkout,
    public readonly idempotencyKey: string | undefined,
  ) {
    super();
    this.payload = Object.freeze({ ...payload });
    Object.freeze(this);
  }
}
