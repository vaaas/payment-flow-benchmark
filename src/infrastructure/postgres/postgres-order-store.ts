import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Checkout } from '../../checkout/domain/create-checkout';
import { CheckoutConflict } from '../../checkout/domain/checkout-conflict';
import { Order } from '../../orders/domain/order';
import { OrderNotFound } from '../../orders/domain/order-not-found';
import type { OrderStore } from '../../orders/domain/order-store';
import type { ProviderEvent } from '../../payments/domain/receive-webhook';
import { ProviderEventConflict } from '../../payments/domain/provider-event-conflict';
import { orders, providerEvents } from './schema';
const toOrder = (row: typeof orders.$inferSelect): Order =>
  new Order({
    ...row,
    amountMinor: row.amountMinor.toString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

export class PostgresOrderStore implements OrderStore {
  constructor(private readonly db: NodePgDatabase) {}
  async create(payload: Checkout) {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(orders)
        .values({
          ...payload,
          id: randomUUID(),
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
          .where(eq(orders.id, payload.orderId))
          .for('update');
        if (!order) throw new OrderNotFound();
        const inserted = await tx
          .insert(providerEvents)
          .values(payload)
          .onConflictDoNothing({ target: providerEvents.eventId })
          .returning();
        if (!inserted.length) {
          const [existing] = await tx
            .select()
            .from(providerEvents)
            .where(eq(providerEvents.eventId, payload.eventId));
          if (
            existing.orderId !== payload.orderId ||
            existing.outcome !== payload.outcome
          )
            throw new ProviderEventConflict();
          return { duplicate: true };
        }
        const status = toOrder(order).paymentStatusAfter(payload.outcome);
        if (status !== order.status)
          await tx
            .update(orders)
            .set({ status })
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
    const [row] = await this.db.select().from(orders).where(eq(orders.id, id));
    if (!row) throw new OrderNotFound();
    return toOrder(row);
  }
}
