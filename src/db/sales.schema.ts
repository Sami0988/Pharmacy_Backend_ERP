import {
  pgTable,
  uuid,
  text,
  timestamp,
  decimal,
  integer,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { branches } from './org.schema';
import { customers } from './parties.schema';
import { batches } from './inventory.schema';

export const sales = pgTable(
  'sales',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    customerId: uuid('customer_id').references(() => customers.id),
    soldBy: uuid('sold_by')
      .notNull()
      .references(() => users.id),
    totalAmount: decimal('total_amount').notNull(),
    paymentMethod: text('payment_method').notNull(),
    receiptUrl: text('receipt_url'),
    receiptGenerated: boolean('receipt_generated').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_sales_branch_id').on(table.branchId),
    index('idx_sales_customer_id').on(table.customerId),
    index('idx_sales_sold_by').on(table.soldBy),
    index('idx_sales_created_at').on(table.createdAt),
  ],
);

export const saleItems = pgTable(
  'sale_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id),
    quantity: integer('quantity').notNull(),
    unitPrice: decimal('unit_price').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_sale_items_sale_id').on(table.saleId),
    index('idx_sale_items_batch_id').on(table.batchId),
    index('idx_sale_items_created_at').on(table.createdAt),
  ],
);

export const saleReturns = pgTable(
  'sale_returns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    saleItemId: uuid('sale_item_id')
      .notNull()
      .references(() => saleItems.id),
    quantity: integer('quantity').notNull(),
    reason: text('reason'),
    processedBy: uuid('processed_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_sale_returns_sale_item_id').on(table.saleItemId),
    index('idx_sale_returns_created_at').on(table.createdAt),
  ],
);
