import {
  pgTable,
  uuid,
  text,
  timestamp,
  decimal,
  integer,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { items } from './items.schema';
import { goodsReceipts } from './finance.schema';
import { locations } from './org.schema';
import { users } from './users.schema';
import { stockMovementTypeEnum } from './enums';

export const batches = pgTable(
  'batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    grnId: uuid('grn_id')
      .notNull()
      .references(() => goodsReceipts.id),
    batchNo: text('batch_no').notNull(),
    expiryDate: date('expiry_date').notNull(),
    packSize: integer('pack_size').notNull().default(1),
    unitCost: decimal('unit_cost').notNull(),
    sellingPrice: decimal('selling_price').notNull(),
    quantityReceived: integer('quantity_received').notNull(),
    qrCodeUrl: text('qr_code_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_batches_batch_no').on(table.batchNo),
    index('idx_batches_item_id').on(table.itemId),
    index('idx_batches_grn_id').on(table.grnId),
    index('idx_batches_expiry_date').on(table.expiryDate),
  ],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    type: stockMovementTypeEnum('type').notNull(),
    quantity: integer('quantity').notNull(),
    refId: uuid('ref_id'),
    refType: text('ref_type'),
    reason: text('reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_stock_movements_batch_id').on(table.batchId),
    index('idx_stock_movements_location_id').on(table.locationId),
    index('idx_stock_movements_batch_location').on(
      table.batchId,
      table.locationId,
    ),
    index('idx_stock_movements_type').on(table.type),
    index('idx_stock_movements_created_at').on(table.createdAt),
    index('idx_stock_movements_batch_loc_qty').on(
      table.batchId,
      table.locationId,
      table.quantity,
    ),
  ],
);

export const transfers = pgTable(
  'transfers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id),
    quantity: integer('quantity').notNull(),
    fromLocationId: uuid('from_location_id')
      .notNull()
      .references(() => locations.id),
    toLocationId: uuid('to_location_id')
      .notNull()
      .references(() => locations.id),
    transferredBy: uuid('transferred_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_transfers_batch_id').on(table.batchId),
    index('idx_transfers_from_location').on(table.fromLocationId),
    index('idx_transfers_to_location').on(table.toLocationId),
    index('idx_transfers_created_at').on(table.createdAt),
  ],
);
