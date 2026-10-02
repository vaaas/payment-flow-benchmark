import type {
  CheckoutSession,
  CheckoutStore,
} from '#src/features/checkout/domain/checkout-store';
import type { IdempotencyKey } from '#src/features/checkout/domain/idempotency-key';
import type { ProviderEventId } from '#src/features/payments/domain/provider-event-id';
import { Order } from '#src/features/orders/domain/order';
import {
  OrderId,
  OrderIdGenerator,
} from '#src/features/orders/domain/order-id';
import { Clock } from '#src/shared/domain/clock';
import { Timestamp } from '#src/shared/domain/timestamp';
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
      insertIfAbsent: async (order: Order) => {
        const taken = [...data.orders.values()].some(
          (existing) =>
            existing.businessOrderReference === order.businessOrderReference,
        );
        if (taken) return false;
        data.orders.set(order.id, order);
        return true;
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
      updateStatus: async (orderId, status: PaymentStatus, at) => {
        const order = data.orders.get(orderId);
        if (!order) throw new Error('Cannot update a missing order');
        data.orders.set(orderId, order.withStatus(status, at));
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

export class FakeClock extends Clock {
  constructor(private current: Timestamp) {
    super();
  }

  public override now(): Timestamp {
    return this.current;
  }

  public advance(milliseconds: number): void {
    this.current = Timestamp.of(
      new Date(this.current.epochMilliseconds + milliseconds),
    );
  }
}

export class SequentialOrderIds extends OrderIdGenerator {
  private sequence = 0;

  public override next(): OrderId {
    this.sequence += 1;
    return OrderId.parse(
      `00000000-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`,
    );
  }
}

export function createInMemoryStores() {
  const data = new InMemoryOrderData();
  return {
    data,
    clock: new FakeClock(Timestamp.of(new Date('2026-10-01T10:00:00.000Z'))),
    ids: new SequentialOrderIds(),
    checkout: new InMemoryCheckoutStore(data),
    payments: new InMemoryPaymentStore(data),
    orders: new InMemoryOrderReader(data),
  };
}
