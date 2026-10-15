/*
  # Add CSV Import Fields to Matches System

  1. Changes to `matches` table
    - Add `match_number` (unique identifier from CSV)
    - Add `designation` (match description from CSV)
    - Add `match_type` (championnat, tournoi, amical)
    - Add fields for venue details (field name, full address)
  
  2. Changes to `venues` table
    - Add `field_name` for specific field within venue
    - Add `full_address` for complete address string
  
  3. Security
    - Existing RLS policies remain in place
*/

-- Add missing columns to matches table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'match_number'
  ) THEN
    ALTER TABLE matches ADD COLUMN match_number text UNIQUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'designation'
  ) THEN
    ALTER TABLE matches ADD COLUMN designation text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'match_type'
  ) THEN
    ALTER TABLE matches ADD COLUMN match_type text DEFAULT 'championnat' CHECK (match_type IN ('championnat', 'tournoi', 'amical', 'coupe'));
  END IF;

  -- Update status column to include new values
  ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_status_check;
  ALTER TABLE matches ADD CONSTRAINT matches_status_check 
    CHECK (status IN ('scheduled', 'planifié', 'à confirmer', 'cancelled', 'annulé', 'postponed', 'reporté'));
END $$;

-- Add fields to venues table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venues' AND column_name = 'field_name'
  ) THEN
    ALTER TABLE venues ADD COLUMN field_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venues' AND column_name = 'full_address'
  ) THEN
    ALTER TABLE venues ADD COLUMN full_address text;
  END IF;
END $$;