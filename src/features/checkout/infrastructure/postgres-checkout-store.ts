import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Container } from '#src/application/dependency-injection/container';
import type {
  CheckoutSession,
  CheckoutStore,
} from '#src/features/checkout/domain/checkout-store';
import type { Checkout } from '#src/features/checkout/domain/create-checkout';
import type { Order } from '#src/features/orders/domain/order';
import { toOrder } from '#src/features/orders/infrastructure/order-mapper';
import { Database } from '#src/infrastructure/postgres/database';
import {
  checkoutIdempotencyKeys,
  orders,
} from '#src/infrastructure/postgres/schema';
import { withTransaction } from '#src/infrastructure/postgres/with-database';
import type { PostgresTransaction } from '#src/infrastructure/postgres/with-database';

class PostgresCheckoutSession implements CheckoutSession {
  constructor(private readonly transaction: PostgresTransaction) {}

  public async lockSubmission(key: string): Promise<void> {
    await this.transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 1))`,
    );
  }

  public async findBySubmission(key: string): Promise<Order | undefined> {
    const [row] = await this.transaction
      .select({ order: orders })
      .from(checkoutIdempotencyKeys)
      .innerJoin(orders, eq(checkoutIdempotencyKeys.orderId, orders.id))
      .where(eq(checkoutIdempotencyKeys.key, key));
    return row && toOrder(row.order);
  }

  public async insertIfAbsent(checkout: Checkout): Promise<Order | undefined> {
    const [row] = await this.transaction
      .insert(orders)
      .values({
        publicId: randomUUID(),
        businessOrderReference: checkout.businessOrderReference,
        amountMinor: BigInt(checkout.amountMinor),
        currency: checkout.currency.code,
      })
      .onConflictDoNothing({ target: orders.businessOrderReference })
      .returning();
    return row && toOrder(row);
  }

  public async findByReference(
    businessOrderReference: string,
  ): Promise<Order | undefined> {
    const [row] = await this.transaction
      .select()
      .from(orders)
      .where(eq(orders.businessOrderReference, businessOrderReference));
    return row && toOrder(row);
  }

  public async bindSubmission(key: string, orderId: string): Promise<void> {
    await this.transaction.insert(checkoutIdempotencyKeys).values({
      key,
      orderId: sql`(SELECT id FROM ${orders} WHERE ${orders.publicId} = ${orderId})`,
    });
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
