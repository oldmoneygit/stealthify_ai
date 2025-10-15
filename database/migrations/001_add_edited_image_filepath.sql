-- Migration: Add edited_image_filepath column to analyses table
-- Date: 2025-01-15

ALTER TABLE analyses ADD COLUMN edited_image_filepath TEXT;
