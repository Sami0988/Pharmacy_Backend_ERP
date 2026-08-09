import { relations } from 'drizzle-orm';
import { users } from './users.schema';
import { refreshTokens, passwordResetTokens } from './auth.schema';
import { branches, locations } from './org.schema';
import { suppliers, customers } from './parties.schema';
import { goodsReceipts, supplierPayments } from './finance.schema';
import { items } from './items.schema';
import { batches, stockMovements, transfers } from './inventory.schema';
import { sales, saleItems, saleReturns } from './sales.schema';
import { auditLog, notifications } from './system.schema';

// Users
export const usersRelations = relations(users, ({ one, many }) => ({
  branch: one(branches, {
    fields: [users.branchId],
    references: [branches.id],
  }),
  sales: many(sales),
  goodsReceipts: many(goodsReceipts),
  transfers: many(transfers),
  auditLog: many(auditLog),
  refreshTokens: many(refreshTokens),
  passwordResetTokens: many(passwordResetTokens),
}));

// Auth
export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  }),
);

// Org
export const branchesRelations = relations(branches, ({ many }) => ({
  users: many(users),
  locations: many(locations),
  goodsReceipts: many(goodsReceipts),
  sales: many(sales),
}));

export const locationsRelations = relations(locations, ({ one }) => ({
  branch: one(branches, {
    fields: [locations.branchId],
    references: [branches.id],
  }),
}));

// Parties
export const suppliersRelations = relations(suppliers, ({ many }) => ({
  goodsReceipts: many(goodsReceipts),
  supplierPayments: many(supplierPayments),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  sales: many(sales),
}));

// Finance
export const goodsReceiptsRelations = relations(
  goodsReceipts,
  ({ one, many }) => ({
    supplier: one(suppliers, {
      fields: [goodsReceipts.supplierId],
      references: [suppliers.id],
    }),
    branch: one(branches, {
      fields: [goodsReceipts.branchId],
      references: [branches.id],
    }),
    createdByUser: one(users, {
      fields: [goodsReceipts.createdBy],
      references: [users.id],
    }),
    batches: many(batches),
    supplierPayments: many(supplierPayments),
  }),
);

export const supplierPaymentsRelations = relations(
  supplierPayments,
  ({ one }) => ({
    supplier: one(suppliers, {
      fields: [supplierPayments.supplierId],
      references: [suppliers.id],
    }),
    goodsReceipt: one(goodsReceipts, {
      fields: [supplierPayments.grnId],
      references: [goodsReceipts.id],
    }),
  }),
);

// Items
export const itemsRelations = relations(items, ({ many }) => ({
  batches: many(batches),
}));

// Inventory
export const batchesRelations = relations(batches, ({ one, many }) => ({
  item: one(items, {
    fields: [batches.itemId],
    references: [items.id],
  }),
  goodsReceipt: one(goodsReceipts, {
    fields: [batches.grnId],
    references: [goodsReceipts.id],
  }),
  stockMovements: many(stockMovements),
  transfers: many(transfers),
  saleItems: many(saleItems),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  batch: one(batches, {
    fields: [stockMovements.batchId],
    references: [batches.id],
  }),
  location: one(locations, {
    fields: [stockMovements.locationId],
    references: [locations.id],
  }),
  createdByUser: one(users, {
    fields: [stockMovements.createdBy],
    references: [users.id],
  }),
}));

export const transfersRelations = relations(transfers, ({ one }) => ({
  batch: one(batches, {
    fields: [transfers.batchId],
    references: [batches.id],
  }),
  fromLocation: one(locations, {
    fields: [transfers.fromLocationId],
    references: [locations.id],
    relationName: 'fromLocation',
  }),
  toLocation: one(locations, {
    fields: [transfers.toLocationId],
    references: [locations.id],
    relationName: 'toLocation',
  }),
  transferredByUser: one(users, {
    fields: [transfers.transferredBy],
    references: [users.id],
  }),
}));

// Sales
export const salesRelations = relations(sales, ({ one, many }) => ({
  branch: one(branches, {
    fields: [sales.branchId],
    references: [branches.id],
  }),
  customer: one(customers, {
    fields: [sales.customerId],
    references: [customers.id],
  }),
  soldByUser: one(users, {
    fields: [sales.soldBy],
    references: [users.id],
  }),
  saleItems: many(saleItems),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, {
    fields: [saleItems.saleId],
    references: [sales.id],
  }),
  batch: one(batches, {
    fields: [saleItems.batchId],
    references: [batches.id],
  }),
}));

export const saleReturnsRelations = relations(saleReturns, ({ one }) => ({
  saleItem: one(saleItems, {
    fields: [saleReturns.saleItemId],
    references: [saleItems.id],
  }),
  processedByUser: one(users, {
    fields: [saleReturns.processedBy],
    references: [users.id],
  }),
}));

// System
export const notificationsRelations = relations(notifications, ({ one }) => ({
  item: one(items, {
    fields: [notifications.itemId],
    references: [items.id],
  }),
  batch: one(batches, {
    fields: [notifications.batchId],
    references: [batches.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));
