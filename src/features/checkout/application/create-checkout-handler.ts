import type { Container } from '#src/application/dependency-injection/container';
import type { EventHandler } from '#src/application/event-handler';
import { Order } from '#src/features/orders/domain/order';
import { OrderIdGenerator } from '#src/features/orders/domain/order-id';
import { Clock } from '#src/shared/domain/clock';
import { CheckoutConflict } from '#src/features/checkout/domain/checkout-conflict';
import { CheckoutStore } from '#src/features/checkout/domain/checkout-store';
import type {
  CheckoutResult,
  CreateCheckout,
} from '#src/features/checkout/domain/create-checkout';

export class CreateCheckoutHandler implements EventHandler<CreateCheckout> {
  public static provide(container: Container): CreateCheckoutHandler {
    return new CreateCheckoutHandler(
      container.get(CheckoutStore),
      container.get(OrderIdGenerator),
      container.get(Clock),
    );
  }

  constructor(
    private readonly store: CheckoutStore,
    private readonly ids: OrderIdGenerator,
    private readonly clock: Clock,
  ) {}

  public handle(event: CreateCheckout): Promise<CheckoutResult> {
    const { payload } = event;
    return this.store.transaction(async (session) => {
      const placed = Order.place(payload, this.ids.next(), this.clock.now());
      const inserted = await session.insertIfAbsent(placed);
      const order = inserted
        ? placed
        : await session.findByReference(payload.businessOrderReference);
      if (!order) throw new Error('Checkout order disappeared during creation');
      if (!order.matchesCheckout(payload)) throw new CheckoutConflict();
      return { order, created: inserted };
    });
  }
}
