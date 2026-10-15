/*
  # Add gender field to members table

  1. Changes
    - Add `gender` column to `members` table
      - Type: TEXT
      - Constraint: CHECK (gender IN ('M', 'F'))
      - Default: 'M'
      - Used for youth category assignment simulation (Juniors vs Féminines)
  
  2. Notes
    - Gender detection combines this field with team name analysis
    - Required for accurate category simulation for next season
*/

ALTER TABLE members 
ADD COLUMN IF NOT EXISTS gender TEXT 
CHECK (gender IN ('M', 'F')) 
DEFAULT 'M';