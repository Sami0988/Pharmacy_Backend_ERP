import {
  pgTable,
  uuid,
  text,
  timestamp,
  decimal,
  date,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { suppliers } from './parties.schema';
import { branches } from './org.schema';
import { users } from './users.schema';
import { paymentDueDateTypeEnum } from './enums';

export const goodsReceipts = pgTable(
  'goods_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    grnNumber: text('grn_number').notNull(),
    receiptDate: date('receipt_date').notNull(),
    invoiceDocumentUrl: text('invoice_document_url'),
    totalCost: decimal('total_cost').notNull(),
    taxPaid: boolean('tax_paid').default(false).notNull(),
    paymentDueDate: date('payment_due_date'),
    paymentDueDateType: paymentDueDateTypeEnum('payment_due_date_type').default(
      'one_month',
    ),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_goods_receipts_grn_number').on(table.grnNumber),
    index('idx_goods_receipts_supplier_id').on(table.supplierId),
    index('idx_goods_receipts_branch_id').on(table.branchId),
    index('idx_goods_receipts_receipt_date').on(table.receiptDate),
    index('idx_goods_receipts_created_at').on(table.createdAt),
    index('idx_goods_receipts_payment_due_date').on(table.paymentDueDate),
  ],
);

export const supplierPayments = pgTable(
  'supplier_payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    grnId: uuid('grn_id')
      .notNull()
      .references(() => goodsReceipts.id),
    amountPaid: decimal('amount_paid').notNull(),
    paymentDate: date('payment_date').notNull(),
    method: text('method').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_supplier_payments_supplier_id').on(table.supplierId),
    index('idx_supplier_payments_grn_id').on(table.grnId),
    index('idx_supplier_payments_payment_date').on(table.paymentDate),
    index('idx_supplier_payments_created_at').on(table.createdAt),
  ],
);
