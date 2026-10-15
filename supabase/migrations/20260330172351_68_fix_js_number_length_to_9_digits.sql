/*
  # Fix js_number length constraint to 9 digits maximum

  1. Changes
    - Drop existing members_js_length constraint
    - Add new constraint allowing NULL or exactly 1-9 digits
    - Ensures js_number can store up to 9 digits maximum
  
  2. Security
    - No changes to RLS policies
*/

ALTER TABLE members 
DROP CONSTRAINT IF EXISTS members_js_length;

ALTER TABLE members 
ADD CONSTRAINT members_js_length 
CHECK (js_number IS NULL OR js_number ~ '^\d{1,9}$');
