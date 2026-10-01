import { z } from 'zod';

export class GetOrder {
  private static readonly schema = z.object({ id: z.uuid() });

  public static from(input: unknown): GetOrder {
    const { id } = GetOrder.schema.parse(input);
    return new GetOrder(id);
  }

  private constructor(public readonly id: string) {
    Object.freeze(this);
  }
}
