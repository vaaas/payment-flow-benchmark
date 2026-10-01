import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  Checkout,
  HttpError,
  nextStatus,
  Order,
  OrderStore,
  ProviderEvent,
} from './domain';
import { orders, providerEvents } from './schema';
const toOrder = (row: typeof orders.$inferSelect): Order => ({
  ...row,
  amountMinor: row.amountMinor.toString(),
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
      if (
        row.amountMinor.toString() !== payload.amountMinor ||
        row.currency !== payload.currency
      )
        throw new HttpError(
          409,
          'Business order reference already has a different checkout payload',
        );
      return { order: toOrder(row), created: inserted.length === 1 };
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
        if (!order) throw new HttpError(404, 'Order not found');
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
            throw new HttpError(
              409,
              'Provider event ID already has a different payload',
            );
          return { duplicate: true };
        }
        const status = nextStatus(order.status, payload.outcome);
        if (status !== order.status)
          await tx
            .update(orders)
            .set({ status })
            .where(eq(orders.id, order.id));
        return { duplicate: false };
      })
      .catch((error) => {
        if (error.code === '23503' || error.cause?.code === '23503')
          throw new HttpError(404, 'Order not found');
        throw error;
      });
  }
  async get(id: string) {
    const [row] = await this.db.select().from(orders).where(eq(orders.id, id));
    if (!row) throw new HttpError(404, 'Order not found');
    return toOrder(row);
  }
}
