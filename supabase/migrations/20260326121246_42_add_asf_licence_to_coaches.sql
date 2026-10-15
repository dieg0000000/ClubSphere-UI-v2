/*
  # Add ASF Licence Number to Coaches

  1. Changes
    - Add `asf_licence_number` column to `coaches` table
    - Add unique constraint to prevent duplicate ASF licence numbers
  
  2. Security
    - No RLS changes needed (inherits existing policies)
*/

ALTER TABLE coaches 
ADD COLUMN IF NOT EXISTS asf_licence_number TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'coaches_asf_unique'
  ) THEN
    ALTER TABLE coaches
    ADD CONSTRAINT coaches_asf_unique 
    UNIQUE (asf_licence_number);
  END IF;
END $$;