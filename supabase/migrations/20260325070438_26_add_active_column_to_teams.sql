/*
  # Add active column to teams table

  1. Changes
    - Add 'active' boolean column to teams table with DEFAULT true
    - This column tracks whether a team is currently active

  2. Notes
    - Uses IF NOT EXISTS to prevent errors if column already exists
    - Default value of true means teams are active by default
*/

ALTER TABLE teams ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
