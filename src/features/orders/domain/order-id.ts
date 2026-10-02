import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { z as zod } from 'zod';
import { newtype } from '#src/shared/domain/newtype';

export const OrderId = newtype(
  'OrderId',
  zod.uuid().transform((value) => value.toLowerCase()),
);

export type OrderId = z.output<typeof OrderId.schema>;

export class OrderIdGenerator {
  public static provide(): OrderIdGenerator {
    return new OrderIdGenerator();
  }

  public next(): OrderId {
    return OrderId.parse(randomUUID());
  }
}
