-- Migration: Add adjustment_unit column to stock_movements table
-- This allows tracking the unit of measurement for stock adjustments

ALTER TABLE stock_movements ADD COLUMN adjustment_unit text;
