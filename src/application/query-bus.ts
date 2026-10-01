import type { GetOrder } from '#src/orders/domain/get-order';
import type { OrderStore } from '#src/orders/domain/order-store';

export class QueryBus {
  constructor(private readonly store: OrderStore) {}

  dispatch(query: GetOrder) {
    return this.store.get(query.id);
  }
}
