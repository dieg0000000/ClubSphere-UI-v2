/*
  # Add requires_volunteers column to events table

  1. Changes
    - Add `requires_volunteers` boolean column to events table with default false
    - This allows events to indicate whether they need volunteer help

  2. Notes
    - Existing events will have requires_volunteers set to false by default
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'requires_volunteers'
  ) THEN
    ALTER TABLE events ADD COLUMN requires_volunteers boolean DEFAULT false;
  END IF;
END $$;
