-- =============================================================================
-- Add questions column to my_tickets
-- Personal workspace Question Mode support
-- Run in Supabase SQL editor
-- =============================================================================

ALTER TABLE my_tickets
    ADD COLUMN IF NOT EXISTS questions jsonb NOT NULL DEFAULT '[]'::jsonb;
