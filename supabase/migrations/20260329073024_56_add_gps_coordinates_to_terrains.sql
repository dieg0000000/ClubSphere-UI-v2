/*
  # Add GPS Coordinates to Terrains

  1. Changes
    - Add `latitude` (numeric) to terrains table
    - Add `longitude` (numeric) to terrains table
  
  2. Important Notes
    - These fields are optional to maintain backward compatibility
    - Used for displaying embedded Google Maps in the UI
*/

-- Add GPS coordinate fields to terrains
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'terrains' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE terrains ADD COLUMN latitude numeric(10, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'terrains' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE terrains ADD COLUMN longitude numeric(11, 8);
  END IF;
END $$;
