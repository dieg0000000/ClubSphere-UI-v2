/*
  # Translate News Categories to French

  1. Changes
    - Drop the old category check constraint
    - Update all existing news category values from English to French
    - Add new check constraint with French values
    - 'News' → 'Actualité'
    - 'Official announcement' → 'Annonce officielle'
    - 'Support meal' → 'Repas de soutien'
    - 'Event' → 'Événement'

  2. Notes
    - This ensures consistency with the French UI
    - All existing articles will have French category names
*/

-- Drop the old check constraint
ALTER TABLE news DROP CONSTRAINT IF EXISTS news_category_check;

-- Update all existing news category values to French
UPDATE news SET category = 'Actualité' WHERE category = 'News';
UPDATE news SET category = 'Annonce officielle' WHERE category = 'Official announcement';
UPDATE news SET category = 'Repas de soutien' WHERE category = 'Support meal';
UPDATE news SET category = 'Événement' WHERE category = 'Event';

-- Add new check constraint with French values
ALTER TABLE news ADD CONSTRAINT news_category_check 
  CHECK (category IN ('Actualité', 'Annonce officielle', 'Repas de soutien', 'Événement'));
