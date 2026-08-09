import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
} from 'drizzle-orm/pg-core';
import { userRoleEnum } from './enums';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull(),
  branchId: uuid('branch_id'),
  isActive: boolean('is_active').default(true).notNull(),
  mfaEnabled: boolean('mfa_enabled').default(false).notNull(),
  mfaSecretEncrypted: text('mfa_secret_encrypted'),
  mfaBackupCodes: jsonb('mfa_backup_codes').$type<string[]>(),
  profileImage: text('profile_image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
