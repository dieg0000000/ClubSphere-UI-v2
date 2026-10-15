/*
  # Fix terrain schema - add missing columns

  1. Changes to `terrain_halves`
    - Add `label` column (text) if not exists
    - Add `active` column (boolean, default true) if not exists
    - Update existing rows to populate label from name

  2. Changes to `terrain_slots`
    - Ensure `team_id` column exists with proper foreign key

  3. Notes
    - Uses IF NOT EXISTS to safely add columns
    - Updates existing data with meaningful defaults
*/

-- Add missing columns to terrain_halves
ALTER TABLE terrain_halves 
ADD COLUMN IF NOT EXISTS label TEXT,
ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Update existing halves to have label from name
UPDATE terrain_halves 
SET label = CASE 
  WHEN name = 'A' THEN 'Moitié A'
  WHEN name = 'B' THEN 'Moitié B'
  ELSE 'Moitié ' || name
END
WHERE label IS NULL;

-- Ensure team_id column exists in terrain_slots
ALTER TABLE terrain_slots
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
