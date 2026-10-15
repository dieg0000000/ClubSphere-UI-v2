/*
  # Add sender_name to club_settings

  1. Changes
    - Add `sender_name` column to `club_settings` for the display name
      used in the "From" header of transactional emails
      (e.g. "FC Romanel"). `sender_email` was added in a prior migration.

  2. Notes
    - Safe idempotent add with IF NOT EXISTS pattern.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_settings' AND column_name = 'sender_name'
  ) THEN
    ALTER TABLE club_settings ADD COLUMN sender_name text;
  END IF;
END $$;
