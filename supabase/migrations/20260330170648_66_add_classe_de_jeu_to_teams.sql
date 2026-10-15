/*
  # Add classe_de_jeu column to teams table

  1. Changes
    - Add `classe_de_jeu` column to `teams` table to store team class/level information
    - Column is optional (nullable) as not all teams have a class designation
    - Reload schema cache to make column available immediately

  2. Notes
    - This column is used during CSV import to differentiate teams with same affiliation and league
*/

ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS classe_de_jeu TEXT;

NOTIFY pgrst, 'reload schema';