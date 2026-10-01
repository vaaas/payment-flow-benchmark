import type { Container } from '#src/application/dependency-injection/container';
import type { EventHandler } from '#src/application/event-handler';
import type { GetOrder } from '#src/features/orders/domain/get-order';
import { OrderStore } from '#src/features/orders/domain/order-store';

export class GetOrderHandler implements EventHandler<GetOrder> {
  public static provide(container: Container): GetOrderHandler {
    return new GetOrderHandler(container.get(OrderStore));
  }

  constructor(private readonly store: OrderStore) {}

  public handle(event: GetOrder) {
    return this.store.get(event.id);
  }
}
