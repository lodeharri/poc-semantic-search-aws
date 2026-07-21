-- Migration: add metadata column to documents table
-- Added missing jsonb column for storing document metadata (topic, tags, etc.)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Backfill existing NULL values to empty object
UPDATE documents SET metadata = '{}'::jsonb WHERE metadata IS NULL;

-- Add NOT NULL constraint (optional metadata, but non-nullable once set)
ALTER TABLE documents ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE documents ALTER COLUMN metadata SET NOT NULL;
