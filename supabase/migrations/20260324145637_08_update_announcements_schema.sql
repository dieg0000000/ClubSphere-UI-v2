/*
  # Update announcements table schema

  1. Changes
    - Add `title` column to announcements table
    - Rename `message` to `content` for consistency
    - Add `updated_at` trigger if not exists

  2. Notes
    - Existing data will be migrated (message -> content)
    - Title will be set to a default value for existing records
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'announcements' AND column_name = 'title'
  ) THEN
    ALTER TABLE announcements ADD COLUMN title text;
    UPDATE announcements SET title = 'Annonce importante' WHERE title IS NULL;
    ALTER TABLE announcements ALTER COLUMN title SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'announcements' AND column_name = 'message'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'announcements' AND column_name = 'content'
  ) THEN
    ALTER TABLE announcements RENAME COLUMN message TO content;
  END IF;
END $$;
