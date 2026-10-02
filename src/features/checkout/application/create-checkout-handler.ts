import type { Container } from '#src/application/dependency-injection/container';
import type { EventHandler } from '#src/application/event-handler';
import { CheckoutConflict } from '#src/features/checkout/domain/checkout-conflict';
import { CheckoutStore } from '#src/features/checkout/domain/checkout-store';
import type {
  CheckoutResult,
  CreateCheckout,
} from '#src/features/checkout/domain/create-checkout';

export class CreateCheckoutHandler implements EventHandler<CreateCheckout> {
  public static provide(container: Container): CreateCheckoutHandler {
    return new CreateCheckoutHandler(container.get(CheckoutStore));
  }

  constructor(private readonly store: CheckoutStore) {}

  public handle(event: CreateCheckout): Promise<CheckoutResult> {
    const { payload, idempotencyKey } = event;
    return this.store.transaction(async (session) => {
      if (idempotencyKey !== undefined) {
        await session.lockSubmission(idempotencyKey);
        const replayed = await session.findBySubmission(idempotencyKey);
        if (replayed) return { order: replayed, created: false };
      }
      const inserted = await session.insertIfAbsent(payload);
      const order =
        inserted ??
        (await session.findByReference(payload.businessOrderReference));
      if (!order) throw new Error('Checkout order disappeared during creation');
      if (!order.matchesCheckout(payload)) throw new CheckoutConflict();
      if (idempotencyKey !== undefined)
        await session.bindSubmission(idempotencyKey, order.id);
      return { order, created: inserted !== undefined };
    });
  }
}
