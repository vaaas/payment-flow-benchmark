import { Order, paymentStatusSchema } from '#src/features/orders/domain/order';
import { Currency } from '#src/shared/domain/currency';
import type { orders } from '#src/infrastructure/postgres/schema';

export const toOrder = (row: typeof orders.$inferSelect): Order => {
  const status = paymentStatusSchema.safeParse(row.status);
  if (!status.success)
    throw new Error(`Stored order ${row.publicId} has an invalid status`);
  return new Order({
    id: row.publicId,
    businessOrderReference: row.businessOrderReference,
    currency: Currency.of(row.currency),
    status: status.data,
    amountMinor: row.amountMinor.toString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
};
