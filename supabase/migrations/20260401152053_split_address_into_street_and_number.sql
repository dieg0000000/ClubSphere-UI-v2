/*
  # Split address field into street and street_number

  1. Changes
    - Add street_number column to members table
    - Automatically split existing addresses into street and number components
    - Example: "Route de la Fontaine 77" becomes street="Route de la Fontaine", street_number="77"
    - Handles addresses with letter suffixes like "12a"

  2. Notes
    - Only splits addresses that contain numbers
    - Preserves addresses without numbers as-is in the street field
    - No data loss, all existing addresses are preserved
*/

-- Add street_number column to members table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'street_number'
  ) THEN
    ALTER TABLE members ADD COLUMN street_number TEXT;
  END IF;
END $$;

-- Split existing addresses into street and street_number
-- Pattern: "Route de la Fontaine 77" or "Chemin des Fleurs 12a"
UPDATE members
SET
  street_number = TRIM(
    REGEXP_REPLACE(address, '^(.*?)\s+(\d+\s*[a-zA-Z]?)$', '\2')
  ),
  address = TRIM(
    REGEXP_REPLACE(address, '^(.*?)\s+\d+\s*[a-zA-Z]?$', '\1')
  )
WHERE address ~ '\d+\s*[a-zA-Z]?\s*$' AND address IS NOT NULL;