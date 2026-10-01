import { Event } from '#src/application/event';
import type { OrderStore } from '#src/features/orders/domain/order-store';
import { z } from 'zod';
import { identifierSchema } from '#src/shared/domain/identifier-schema';

export type Checkout = Readonly<{
  businessOrderReference: string;
  amountMinor: string;
  currency: string;
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
    currency: z.string().regex(/^[A-Z]{3}$/),
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
