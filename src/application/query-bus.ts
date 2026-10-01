import type { GetOrder } from '../orders/domain/get-order';
import type { OrderStore } from '../orders/domain/order-store';

export class QueryBus {
  constructor(private readonly store: OrderStore) {}

  dispatch(query: GetOrder) {
    return this.store.get(query.id);
  }
}
