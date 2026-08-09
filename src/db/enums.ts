import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'store_keeper',
  'cashier',
]);

export const stockMovementTypeEnum = pgEnum('stock_movement_type', [
  'receipt',
  'transfer_out',
  'transfer_in',
  'sale',
  'sale_return',
  'adjustment',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'zero_stock',
  'low_stock',
  'near_expiry',
  'expired',
  'payment_due',
  'payment_overdue',
]);

export const paymentDueDateTypeEnum = pgEnum('payment_due_date_type', [
  'one_month',
  'two_months',
  'six_months',
  'one_year',
  'other',
]);
