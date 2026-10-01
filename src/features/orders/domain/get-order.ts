import { Event } from '#src/application/event';
import type { OrderStore } from '#src/features/orders/domain/order-store';
import { z } from 'zod';

export class GetOrder extends Event<Awaited<ReturnType<OrderStore['get']>>> {
  private static readonly schema = z.object({ id: z.uuid() });

  public static from(input: unknown): GetOrder {
    const { id } = GetOrder.schema.parse(input);
    return new GetOrder(id);
  }

  private constructor(public readonly id: string) {
    super();
    Object.freeze(this);
  }
}
