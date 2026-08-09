import { pgTable, uuid, text, timestamp, decimal, index } from 'drizzle-orm/pg-core';

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    address: text('address'),
    licenseNo: text('license_no'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_suppliers_name').on(table.name),
    index('idx_suppliers_deleted_at').on(table.deletedAt),
  ],
);

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    phone: text('phone'),
    creditBalance: decimal('credit_balance').default('0').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_customers_name').on(table.name),
    index('idx_customers_phone').on(table.phone),
    index('idx_customers_deleted_at').on(table.deletedAt),
  ],
);
