import { pgTable, uuid, text, bigint, timestamp } from 'drizzle-orm/pg-core';
import { PaymentStatus } from './domain';
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey(),
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
  eventId: text('event_id').primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),
  outcome: text('outcome').$type<'failed' | 'succeeded'>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
