import type { OrderId } from '#src/features/orders/domain/order-id';
import type { Order } from '#src/features/orders/domain/order';

export abstract class OrderReader {
  abstract find(id: OrderId): Promise<Order | undefined>;
}
