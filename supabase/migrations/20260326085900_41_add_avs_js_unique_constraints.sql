/*
  # Add Unique Constraints for AVS and J+S Numbers

  1. Purpose
    - Ensure AVS numbers are unique within each table (members, coaches, committee_members)
    - Ensure J+S numbers are unique within tables that have them (members, coaches)
    - Constraints only apply to non-null values

  2. Schema Changes
    - Add avs_number and js_number to coaches table if they don't exist

  3. Data Cleanup
    - Remove duplicate AVS numbers (keep first occurrence, nullify others)
    - Remove duplicate J+S numbers (keep first occurrence, nullify others)

  4. Unique Constraints Added
    - members.avs_number (unique)
    - coaches.avs_number (unique)
    - committee_members.avs_number (unique)
    - members.js_number (unique)
    - coaches.js_number (unique)

  5. Notes
    - NULL values are allowed and do not violate uniqueness
    - Cross-table uniqueness must be enforced in application logic
    - Frontend will validate across all tables before INSERT/UPDATE
*/

-- Add avs_number and js_number columns to coaches table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'coaches' AND column_name = 'avs_number'
  ) THEN
    ALTER TABLE coaches ADD COLUMN avs_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'coaches' AND column_name = 'js_number'
  ) THEN
    ALTER TABLE coaches ADD COLUMN js_number text;
  END IF;
END $$;

-- Clean up duplicate AVS numbers in members table (keep first, nullify rest)
WITH ranked_members AS (
  SELECT id, avs_number,
    ROW_NUMBER() OVER (PARTITION BY avs_number ORDER BY created_at) as rn
  FROM members
  WHERE avs_number IS NOT NULL
)
UPDATE members
SET avs_number = NULL
FROM ranked_members
WHERE members.id = ranked_members.id
  AND ranked_members.rn > 1;

-- Clean up duplicate J+S numbers in members table (keep first, nullify rest)
WITH ranked_members_js AS (
  SELECT id, js_number,
    ROW_NUMBER() OVER (PARTITION BY js_number ORDER BY created_at) as rn
  FROM members
  WHERE js_number IS NOT NULL
)
UPDATE members
SET js_number = NULL
FROM ranked_members_js
WHERE members.id = ranked_members_js.id
  AND ranked_members_js.rn > 1;

-- Add unique constraint for AVS number in members table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'members_avs_unique'
  ) THEN
    ALTER TABLE members 
    ADD CONSTRAINT members_avs_unique UNIQUE (avs_number);
  END IF;
END $$;

-- Add unique constraint for AVS number in coaches table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'coaches_avs_unique'
  ) THEN
    ALTER TABLE coaches 
    ADD CONSTRAINT coaches_avs_unique UNIQUE (avs_number);
  END IF;
END $$;

-- Add unique constraint for AVS number in committee_members table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'committee_avs_unique'
  ) THEN
    ALTER TABLE committee_members 
    ADD CONSTRAINT committee_avs_unique UNIQUE (avs_number);
  END IF;
END $$;

-- Add unique constraint for J+S number in members table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'members_js_unique'
  ) THEN
    ALTER TABLE members 
    ADD CONSTRAINT members_js_unique UNIQUE (js_number);
  END IF;
END $$;

-- Add unique constraint for J+S number in coaches table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'coaches_js_unique'
  ) THEN
    ALTER TABLE coaches 
    ADD CONSTRAINT coaches_js_unique UNIQUE (js_number);
  END IF;
END $$;