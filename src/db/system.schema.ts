import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { notificationTypeEnum } from './enums';
import { users } from './users.schema';
import { items } from './items.schema';
import { batches } from './inventory.schema';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    itemId: uuid('item_id'),
    batchId: uuid('batch_id').references(() => batches.id),
    thresholdDays: integer('threshold_days'),
    isRead: boolean('is_read').default(false).notNull(),
    readBy: uuid('read_by').references(() => users.id),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_notifications_type').on(table.type),
    index('idx_notifications_is_read').on(table.isRead),
    index('idx_notifications_type_is_read').on(table.type, table.isRead),
    index('idx_notifications_item_id').on(table.itemId),
    index('idx_notifications_batch_id').on(table.batchId),
    index('idx_notifications_created_at').on(table.createdAt),
  ],
);

export const loginHistory = pgTable(
  'login_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    success: boolean('success').default(true).notNull(),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_login_history_user_id').on(table.userId),
    index('idx_login_history_created_at').on(table.createdAt),
    index('idx_login_history_user_id_created_at').on(table.userId, table.createdAt),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    beforeData: jsonb('before_data'),
    afterData: jsonb('after_data'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_log_user_id').on(table.userId),
    index('idx_audit_log_entity_type').on(table.entityType),
    index('idx_audit_log_entity_id').on(table.entityId),
    index('idx_audit_log_created_at').on(table.createdAt),
  ],
);
