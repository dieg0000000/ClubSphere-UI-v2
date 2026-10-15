/*
  # Fix terrain_slots day column naming

  1. Changes
    - Drop the duplicate text "day" column (nullable, unused)
    - Rename "day_of_week" (integer, NOT NULL) to "day" for consistency
    - This resolves the "null value in column day_of_week violates not-null constraint" error

  2. Notes
    - The table had both "day" (text, nullable) and "day_of_week" (integer, NOT NULL)
    - We keep the integer column as it's the one actually used (NOT NULL constraint)
    - All code will be updated to reference "day" instead of "day_of_week"
*/

-- Drop the duplicate text "day" column
ALTER TABLE terrain_slots DROP COLUMN IF EXISTS day;

-- Rename day_of_week to day
ALTER TABLE terrain_slots RENAME COLUMN day_of_week TO day;