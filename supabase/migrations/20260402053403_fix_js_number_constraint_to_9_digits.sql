/*
  # Fix JS Number Constraint to 9 Digits

  1. Purpose
    - Update the JS number constraint to allow up to 9 digits instead of 7
    - Align database validation with updated application requirements
  
  2. Changes
    - Drop existing members_js_length constraint if it exists
    - Add new constraint allowing 1-9 digits for js_number field
  
  3. Notes
    - NULL values are still allowed
    - Only numeric digits are permitted (no letters or special characters)
*/

-- Drop existing constraint if it exists
ALTER TABLE members 
DROP CONSTRAINT IF EXISTS members_js_length;

-- Add new constraint for 1-9 digits
ALTER TABLE members
ADD CONSTRAINT members_js_length
CHECK (js_number IS NULL OR js_number ~ '^\d{1,9}$');
