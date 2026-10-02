import { eq } from 'drizzle-orm';
import type { Container } from '#src/application/dependency-injection/container';
import type {
  CheckoutSession,
  CheckoutStore,
} from '#src/features/checkout/domain/checkout-store';
import type { BusinessOrderReference } from '#src/features/checkout/domain/business-order-reference';
import type { Order } from '#src/features/orders/domain/order';
import { toOrder } from '#src/features/orders/infrastructure/order-mapper';
import { Database } from '#src/infrastructure/postgres/database';
import { orders } from '#src/infrastructure/postgres/schema';
import { withTransaction } from '#src/infrastructure/postgres/with-database';
import type { PostgresTransaction } from '#src/infrastructure/postgres/with-database';

class PostgresCheckoutSession implements CheckoutSession {
  constructor(private readonly transaction: PostgresTransaction) {}

  public async insertIfAbsent(order: Order): Promise<boolean> {
    const inserted = await this.transaction
      .insert(orders)
      .values({
        publicId: order.id,
        businessOrderReference: order.businessOrderReference,
        amountMinor: order.amountMinor.minorUnits,
        currency: order.currency.code,
        status: order.status,
        createdAt: order.createdAt.toDate(),
        updatedAt: order.updatedAt.toDate(),
      })
      .onConflictDoNothing({ target: orders.businessOrderReference })
      .returning({ id: orders.id });
    return inserted.length > 0;
  }

  public async findByReference(
    businessOrderReference: BusinessOrderReference,
  ): Promise<Order | undefined> {
    const [row] = await this.transaction
      .select()
      .from(orders)
      .where(eq(orders.businessOrderReference, businessOrderReference));
    return row && toOrder(row);
  }
}

export class PostgresCheckoutStore implements CheckoutStore {
  public static provide(container: Container): PostgresCheckoutStore {
    return new PostgresCheckoutStore(container.get(Database));
  }

  constructor(private readonly database: Database) {}

  public transaction<T>(
    work: (session: CheckoutSession) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.database, (transaction) =>
      work(new PostgresCheckoutSession(transaction)),
    );
  }
}
