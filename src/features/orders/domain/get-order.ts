import { Event } from '#src/application/event';
import type { Order } from '#src/features/orders/domain/order';
import { z } from 'zod';
import { OrderId } from '#src/features/orders/domain/order-id';

export class GetOrder extends Event<Order> {
  private static readonly schema = z.object({ id: OrderId.schema });

  public static from(input: unknown): GetOrder {
    const { id } = GetOrder.schema.parse(input);
    return new GetOrder(id);
  }

  private constructor(public readonly id: OrderId) {
    super();
    Object.freeze(this);
  }
}
