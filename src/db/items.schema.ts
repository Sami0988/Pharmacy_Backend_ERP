import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  decimal,
  index,
} from 'drizzle-orm/pg-core';

export const items = pgTable(
  'items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    genericName: text('generic_name'),
    category: text('category'),
    unit: text('unit').notNull(),
    strength: text('strength'),
    reorderLevel: integer('reorder_level').default(0).notNull(),
    isControlledSubstance: boolean('is_controlled_substance')
      .default(false)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_items_name').on(table.name),
    index('idx_items_generic_name').on(table.genericName),
    index('idx_items_category').on(table.category),
    index('idx_items_deleted_at').on(table.deletedAt),
  ],
);
