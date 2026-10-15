/*
  # Update Gender from Salutation

  1. Purpose
    - Map existing salutation values to gender field
    - Fix members where gender is null or incorrectly set
  
  2. Changes
    - Update gender to 'F' for members with 'Madame' or 'Mme' salutation
    - Update gender to 'M' for members with 'Monsieur' or 'M.' salutation
  
  3. Notes
    - Only updates records where gender is null or needs correction
    - Case-insensitive matching for salutation values
*/

-- Update gender to 'F' for feminine salutations
UPDATE members 
SET gender = 'F'
WHERE (salutation ILIKE '%madame%' 
  OR salutation ILIKE '%mme%')
AND (gender IS NULL OR gender = 'M');

-- Update gender to 'M' for masculine salutations
UPDATE members
SET gender = 'M'  
WHERE (salutation ILIKE '%monsieur%'
  OR salutation ILIKE '%m.%')
AND gender IS NULL;
