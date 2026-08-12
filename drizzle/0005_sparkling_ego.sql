-- Migration: Enable pg_trgm extension for similarity() function used in item search
-- Run: npx drizzle-kit migrate
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
