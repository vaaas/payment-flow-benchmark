import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Container } from '#src/application/dependency-injection/container';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Checkout } from '#src/features/checkout/domain/create-checkout';
import { CheckoutConflict } from '#src/features/checkout/domain/checkout-conflict';
import { Order } from '#src/features/orders/domain/order';
import { OrderNotFound } from '#src/features/orders/domain/order-not-found';
import type { OrderStore } from '#src/features/orders/domain/order-store';
import type { ProviderEvent } from '#src/features/payments/domain/receive-webhook';
import { ProviderEventConflict } from '#src/features/payments/domain/provider-event-conflict';
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
      if (!row) throw new Error('Checkout order disappeared during creation');
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
          if (!existing)
            throw new Error('Provider event disappeared during processing');
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
      .catch((error: unknown) => {
        if (typeof error === 'object' && error !== null) {
          const cause = 'cause' in error ? error.cause : undefined;
          if (
            ('code' in error && error.code === '23503') ||
            (typeof cause === 'object' &&
              cause !== null &&
              'code' in cause &&
              cause.code === '23503')
          )
            throw new OrderNotFound();
        }
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
