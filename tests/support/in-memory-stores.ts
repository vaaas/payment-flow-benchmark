import type {
  CheckoutSession,
  CheckoutStore,
} from '#src/features/checkout/domain/checkout-store';
import type { IdempotencyKey } from '#src/features/checkout/domain/idempotency-key';
import type { ProviderEventId } from '#src/features/payments/domain/provider-event-id';
import type { Checkout } from '#src/features/checkout/domain/create-checkout';
import { Order } from '#src/features/orders/domain/order';
import { OrderId } from '#src/features/orders/domain/order-id';
import type { PaymentStatus } from '#src/features/orders/domain/order';
import type { OrderReader } from '#src/features/orders/domain/order-reader';
import type {
  PaymentSession,
  PaymentStore,
} from '#src/features/payments/domain/payment-store';
import type { ProviderEvent } from '#src/features/payments/domain/receive-webhook';

export class InMemoryOrderData {
  public orders = new Map<OrderId, Order>();
  public events = new Map<ProviderEventId, ProviderEvent>();
  public submissions = new Map<IdempotencyKey, OrderId>();

  constructor(
    public readonly newId: () => OrderId,
    public readonly now: () => string,
  ) {}

  public snapshot() {
    return {
      orders: new Map(this.orders),
      events: new Map(this.events),
      submissions: new Map(this.submissions),
    };
  }

  public restore(snapshot: ReturnType<InMemoryOrderData['snapshot']>) {
    this.orders = snapshot.orders;
    this.events = snapshot.events;
    this.submissions = snapshot.submissions;
  }

  public async transaction<T>(work: () => Promise<T>): Promise<T> {
    const before = this.snapshot();
    try {
      return await work();
    } catch (error) {
      this.restore(before);
      throw error;
    }
  }
}

export class InMemoryCheckoutStore implements CheckoutStore {
  constructor(private readonly data: InMemoryOrderData) {}

  public transaction<T>(
    work: (session: CheckoutSession) => Promise<T>,
  ): Promise<T> {
    return this.data.transaction(() => work(this.session()));
  }

  private session(): CheckoutSession {
    const { data } = this;
    const find = (id: OrderId | undefined) =>
      id === undefined ? undefined : data.orders.get(id);
    return {
      lockSubmission: async () => undefined,
      findBySubmission: async (key) => find(data.submissions.get(key)),
      insertIfAbsent: async (checkout: Checkout) => {
        const taken = [...data.orders.values()].some(
          (order) =>
            order.businessOrderReference === checkout.businessOrderReference,
        );
        if (taken) return undefined;
        const now = data.now();
        const order = new Order({
          ...checkout,
          id: data.newId(),
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        });
        data.orders.set(order.id, order);
        return order;
      },
      findByReference: async (reference) =>
        [...data.orders.values()].find(
          (order) => order.businessOrderReference === reference,
        ),
      bindSubmission: async (key, orderId) => {
        data.submissions.set(key, orderId);
      },
    };
  }
}

export class InMemoryPaymentStore implements PaymentStore {
  constructor(private readonly data: InMemoryOrderData) {}

  public transaction<T>(
    work: (session: PaymentSession) => Promise<T>,
  ): Promise<T> {
    return this.data.transaction(() => work(this.session()));
  }

  private session(): PaymentSession {
    const { data } = this;
    return {
      lockOrder: async (orderId) => data.orders.get(orderId),
      insertEvent: async (event) => {
        if (data.events.has(event.eventId)) return false;
        data.events.set(event.eventId, event);
        return true;
      },
      findEvent: async (eventId) => data.events.get(eventId),
      updateStatus: async (orderId, status: PaymentStatus) => {
        const order = data.orders.get(orderId);
        if (!order) throw new Error('Cannot update a missing order');
        data.orders.set(
          orderId,
          new Order({ ...order, status, updatedAt: data.now() }),
        );
      },
    };
  }
}

export class InMemoryOrderReader implements OrderReader {
  constructor(private readonly data: InMemoryOrderData) {}

  public async find(id: OrderId): Promise<Order | undefined> {
    return this.data.orders.get(id);
  }
}

export function createInMemoryStores() {
  let sequence = 0;
  const data = new InMemoryOrderData(
    () =>
      OrderId.parse(
        `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
      ),
    () => new Date(Date.UTC(2026, 9, 1, 10, 0, sequence)).toISOString(),
  );
  return {
    data,
    checkout: new InMemoryCheckoutStore(data),
    payments: new InMemoryPaymentStore(data),
    orders: new InMemoryOrderReader(data),
    tick: () => {
      sequence += 100;
    },
  };
}
