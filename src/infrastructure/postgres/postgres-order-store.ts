import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Container } from '#src/application/dependency-injection/container';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Checkout } from '#src/checkout/domain/create-checkout';
import { CheckoutConflict } from '#src/checkout/domain/checkout-conflict';
import { Order } from '#src/orders/domain/order';
import { OrderNotFound } from '#src/orders/domain/order-not-found';
import type { OrderStore } from '#src/orders/domain/order-store';
import type { ProviderEvent } from '#src/payments/domain/receive-webhook';
import { ProviderEventConflict } from '#src/payments/domain/provider-event-conflict';
import { orders, providerEvents } from '#src/infrastructure/postgres/schema';
const toOrder = (row: typeof orders.$inferSelect): Order =>
  new Order({
    id: row.publicId,
    businessOrderReference: row.businessOrderReference,
    currency: row.currency,
    status: row.status,
    amountMinor: row.amountMinor.toString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

export class PostgresOrderStore implements OrderStore {
  public static provide(container: Container): PostgresOrderStore {
    return new PostgresOrderStore(drizzle(container.get(Pool)));
  }

  constructor(private readonly db: NodePgDatabase) {}
  async create(payload: Checkout) {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(orders)
        .values({
          ...payload,
          publicId: randomUUID(),
          amountMinor: BigInt(payload.amountMinor),
        })
        .onConflictDoNothing({ target: orders.businessOrderReference })
        .returning();
      const row =
        inserted[0] ??
        (
          await tx
            .select()
            .from(orders)
            .where(
              eq(orders.businessOrderReference, payload.businessOrderReference),
            )
        )[0];
      const order = toOrder(row);
      if (!order.matchesCheckout(payload)) throw new CheckoutConflict();
      return { order, created: inserted.length === 1 };
    });
  }
  async receive(payload: ProviderEvent) {
    return this.db
      .transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.publicId, payload.orderId))
          .for('update');
        if (!order) throw new OrderNotFound();
        const inserted = await tx
          .insert(providerEvents)
          .values({ ...payload, orderId: order.id })
          .onConflictDoNothing({ target: providerEvents.eventId })
          .returning();
        if (!inserted.length) {
          const [existing] = await tx
            .select()
            .from(providerEvents)
            .where(eq(providerEvents.eventId, payload.eventId));
          if (
            existing.orderId !== order.id ||
            existing.outcome !== payload.outcome
          )
            throw new ProviderEventConflict();
          return { duplicate: true };
        }
        const status = toOrder(order).paymentStatusAfter(payload.outcome);
        if (status !== order.status)
          await tx
            .update(orders)
            .set({ status, updatedAt: new Date() })
            .where(eq(orders.id, order.id));
        return { duplicate: false };
      })
      .catch((error) => {
        if (error.code === '23503' || error.cause?.code === '23503')
          throw new OrderNotFound();
        throw error;
      });
  }
  async get(id: string) {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.publicId, id));
    if (!row) throw new OrderNotFound();
    return toOrder(row);
  }
}
