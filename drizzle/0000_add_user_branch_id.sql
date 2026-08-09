-- Migration: Add branch_id column to users table
-- Run: npx drizzle-kit migrate

ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);

-- Assign existing users to the first branch (Main Branch)
UPDATE users SET branch_id = (SELECT id FROM branches LIMIT 1) WHERE branch_id IS NULL;
