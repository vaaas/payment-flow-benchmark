import type { Order } from '#src/features/orders/domain/order';

export abstract class OrderReader {
  abstract find(id: string): Promise<Order | undefined>;
}
