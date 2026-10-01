import type { EventHandler } from '#src/application/event-handler';
import type { GetOrder } from '#src/orders/domain/get-order';
import type { OrderStore } from '#src/orders/domain/order-store';

export class GetOrderHandler implements EventHandler<GetOrder> {
  constructor(private readonly store: OrderStore) {}

  public handle(event: GetOrder) {
    return this.store.get(event.id);
  }
}
