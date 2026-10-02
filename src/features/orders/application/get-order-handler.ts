import type { Container } from '#src/application/dependency-injection/container';
import type { EventHandler } from '#src/application/event-handler';
import type { GetOrder } from '#src/features/orders/domain/get-order';
import type { Order } from '#src/features/orders/domain/order';
import { OrderNotFound } from '#src/features/orders/domain/order-not-found';
import { OrderReader } from '#src/features/orders/domain/order-reader';

export class GetOrderHandler implements EventHandler<GetOrder> {
  public static provide(container: Container): GetOrderHandler {
    return new GetOrderHandler(container.get(OrderReader));
  }

  constructor(private readonly reader: OrderReader) {}

  public async handle(event: GetOrder): Promise<Order> {
    const order = await this.reader.find(event.id);
    if (!order) throw new OrderNotFound();
    return order;
  }
}
