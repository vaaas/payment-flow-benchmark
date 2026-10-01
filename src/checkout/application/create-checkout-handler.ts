import type { EventHandler } from '#src/application/event-handler';
import type { CreateCheckout } from '#src/checkout/domain/create-checkout';
import type { OrderStore } from '#src/orders/domain/order-store';

export class CreateCheckoutHandler implements EventHandler<CreateCheckout> {
  constructor(private readonly store: OrderStore) {}

  public handle(event: CreateCheckout) {
    return this.store.create(event.payload);
  }
}
