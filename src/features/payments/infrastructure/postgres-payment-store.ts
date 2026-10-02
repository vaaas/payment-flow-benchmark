import { eq, sql } from 'drizzle-orm';
import type { Container } from '#src/application/dependency-injection/container';
import type { OrderId } from '#src/features/orders/domain/order-id';
import type { ProviderEventId } from '#src/features/payments/domain/provider-event-id';
import type { Order, PaymentStatus } from '#src/features/orders/domain/order';
import { toOrder } from '#src/features/orders/infrastructure/order-mapper';
import type {
  PaymentSession,
  PaymentStore,
} from '#src/features/payments/domain/payment-store';
import type { ProviderEvent } from '#src/features/payments/domain/receive-webhook';
import type { Timestamp } from '#src/shared/domain/timestamp';
import { Database } from '#src/infrastructure/postgres/database';
import { orders, providerEvents } from '#src/infrastructure/postgres/schema';
import { withTransaction } from '#src/infrastructure/postgres/with-database';
import type { PostgresTransaction } from '#src/infrastructure/postgres/with-database';

class PostgresPaymentSession implements PaymentSession {
  constructor(private readonly transaction: PostgresTransaction) {}

  public async lockOrder(orderId: OrderId): Promise<Order | undefined> {
    const [row] = await this.transaction
      .select()
      .from(orders)
      .where(eq(orders.publicId, orderId))
      .for('update');
    return row && toOrder(row);
  }

  public async insertEvent(event: ProviderEvent): Promise<boolean> {
    const inserted = await this.transaction
      .insert(providerEvents)
      .values({
        eventId: event.eventId,
        outcome: event.outcome,
        orderId: sql`(SELECT id FROM ${orders} WHERE ${orders.publicId} = ${event.orderId})`,
      })
      .onConflictDoNothing({ target: providerEvents.eventId })
      .returning({ id: providerEvents.id });
    return inserted.length > 0;
  }

  public async findEvent(
    eventId: ProviderEventId,
  ): Promise<ProviderEvent | undefined> {
    const [row] = await this.transaction
      .select({
        eventId: providerEvents.eventId,
        outcome: providerEvents.outcome,
        orderId: orders.publicId,
      })
      .from(providerEvents)
      .innerJoin(orders, eq(providerEvents.orderId, orders.id))
      .where(eq(providerEvents.eventId, eventId));
    return row;
  }

  public async updateStatus(
    orderId: OrderId,
    status: PaymentStatus,
    at: Timestamp,
  ): Promise<void> {
    await this.transaction
      .update(orders)
      .set({ status, updatedAt: at.toDate() })
      .where(eq(orders.publicId, orderId));
  }
}

export class PostgresPaymentStore implements PaymentStore {
  public static provide(container: Container): PostgresPaymentStore {
    return new PostgresPaymentStore(container.get(Database));
  }

  constructor(private readonly database: Database) {}

  public transaction<T>(
    work: (session: PaymentSession) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.database, (transaction) =>
      work(new PostgresPaymentSession(transaction)),
    );
  }
}
