import type { Container } from '#src/application/dependency-injection/container';
import type { EventHandler } from '#src/application/event-handler';
import type { CreateCheckout } from '#src/features/checkout/domain/create-checkout';
import { OrderStore } from '#src/features/orders/domain/order-store';

export class CreateCheckoutHandler implements EventHandler<CreateCheckout> {
  public static provide(container: Container): CreateCheckoutHandler {
    return new CreateCheckoutHandler(container.get(OrderStore));
  }

  constructor(private readonly store: OrderStore) {}

  public handle(event: CreateCheckout) {
    return this.store.create(event.payload, event.idempotencyKey);
  }
}
