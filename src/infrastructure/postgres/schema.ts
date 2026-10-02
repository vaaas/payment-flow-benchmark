import {
  pgTable,
  uuid,
  text,
  bigint,
  timestamp,
  serial,
  integer,
} from 'drizzle-orm/pg-core';
import type { BusinessOrderReference } from '#src/features/checkout/domain/business-order-reference';
import type { IdempotencyKey } from '#src/features/checkout/domain/idempotency-key';
import type { OrderId } from '#src/features/orders/domain/order-id';
import type { PaymentStatus } from '#src/features/orders/domain/order';
import type { ProviderEventId } from '#src/features/payments/domain/provider-event-id';
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  publicId: uuid('public_id').$type<OrderId>().notNull().unique(),
  businessOrderReference: text('business_order_reference')
    .$type<BusinessOrderReference>()
    .notNull().unique(),
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
  eventId: text('event_id').$type<ProviderEventId>().notNull().unique(),
  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id),
  outcome: text('outcome').$type<'failed' | 'succeeded'>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const checkoutIdempotencyKeys = pgTable('checkout_idempotency_keys', {
  id: serial('id').primaryKey(),
  key: text('key').$type<IdempotencyKey>().notNull().unique(),
  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
