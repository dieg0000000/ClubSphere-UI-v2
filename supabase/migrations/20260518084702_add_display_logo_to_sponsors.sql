/*
  # Add display_logo toggle to sponsors

  1. Modified Tables
    - `sponsors`
      - Added `display_logo` (boolean, NOT NULL, DEFAULT true)
        Controls whether the sponsor's logo appears in the public carousel widget

  2. Backfill
    - All existing sponsors get display_logo = true (handled by DEFAULT)

  3. Notes
    - No RLS changes needed — existing policies already cover this column
    - Column defaults to true so new sponsors are visible by default
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sponsors' AND column_name = 'display_logo'
  ) THEN
    ALTER TABLE sponsors ADD COLUMN display_logo boolean NOT NULL DEFAULT true;
  END IF;
END $$;
