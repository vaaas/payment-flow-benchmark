import {
  pgTable,
  uuid,
  text,
  bigint,
  timestamp,
  serial,
  integer,
} from 'drizzle-orm/pg-core';
import type { PaymentStatus } from '#src/features/orders/domain/order';
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  publicId: uuid('public_id').notNull().unique(),
  businessOrderReference: text('business_order_reference').notNull().unique(),
  amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull(),
  status: text('status').$type<PaymentStatus>().notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const providerEvents = pgTable('provider_events', {
  id: serial('id').primaryKey(),
  eventId: text('event_id').notNull().unique(),
  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id),
  outcome: text('outcome').$type<'failed' | 'succeeded'>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
