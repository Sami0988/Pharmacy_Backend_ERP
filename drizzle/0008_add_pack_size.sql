-- Migration: Add pack_size column to batches table
-- This allows tracking how many individual units are in each pack

ALTER TABLE batches ADD COLUMN pack_size integer NOT NULL DEFAULT 1;
