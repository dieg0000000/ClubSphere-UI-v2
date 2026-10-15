/*
  # Add length constraints for J+S and ASF licence numbers

  1. Changes
    - Pad existing js_number values in members table to 7 digits
    - Pad existing asf_licence_number values in members table to 7 digits
    - Add CHECK constraint to members table ensuring js_number is exactly 7 digits
    - Add CHECK constraint to members table ensuring asf_licence_number is exactly 7 digits
    - Add CHECK constraint to coaches table ensuring js_number is exactly 7 digits
    - Add CHECK constraint to coaches table ensuring asf_licence_number is exactly 7 digits

  2. Security
    - No RLS changes (constraints are at database level)
*/

-- Pad existing js_number values in members table to 7 digits
UPDATE members 
SET js_number = LPAD(js_number, 7, '0') 
WHERE js_number IS NOT NULL AND length(js_number) < 7;

-- Pad existing asf_licence_number values in members table to 7 digits
UPDATE members 
SET asf_licence_number = LPAD(asf_licence_number, 7, '0') 
WHERE asf_licence_number IS NOT NULL AND length(asf_licence_number) < 7;

-- Truncate js_number values that are too long in members table
UPDATE members 
SET js_number = RIGHT(js_number, 7) 
WHERE js_number IS NOT NULL AND length(js_number) > 7;

-- Truncate asf_licence_number values that are too long in members table
UPDATE members 
SET asf_licence_number = RIGHT(asf_licence_number, 7) 
WHERE asf_licence_number IS NOT NULL AND length(asf_licence_number) > 7;

-- Add length constraints to members table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE constraint_name = 'members_js_length'
  ) THEN
    ALTER TABLE members 
    ADD CONSTRAINT members_js_length 
      CHECK (js_number IS NULL OR length(js_number) = 7);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE constraint_name = 'members_asf_length'
  ) THEN
    ALTER TABLE members 
    ADD CONSTRAINT members_asf_length 
      CHECK (asf_licence_number IS NULL OR length(asf_licence_number) = 7);
  END IF;
END $$;

-- Add length constraints to coaches table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE constraint_name = 'coaches_js_length'
  ) THEN
    ALTER TABLE coaches 
    ADD CONSTRAINT coaches_js_length 
      CHECK (js_number IS NULL OR length(js_number) = 7);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE constraint_name = 'coaches_asf_length'
  ) THEN
    ALTER TABLE coaches 
    ADD CONSTRAINT coaches_asf_length 
      CHECK (asf_licence_number IS NULL OR length(asf_licence_number) = 7);
  END IF;
END $$;