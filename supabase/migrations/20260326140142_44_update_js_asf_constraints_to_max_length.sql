/*
  # Update J+S and ASF licence constraints to maximum length

  1. Changes
    - Drop existing CHECK constraints requiring exactly 7 digits
    - Add new CHECK constraints allowing maximum 7 digits for js_number in members table
    - Add new CHECK constraints allowing maximum 7 digits for asf_licence_number in members table
    - Add new CHECK constraints allowing maximum 7 digits for js_number in coaches table
    - Add new CHECK constraints allowing maximum 7 digits for asf_licence_number in coaches table

  2. Security
    - No RLS changes (constraints are at database level)
*/

-- Drop existing constraints from members table
ALTER TABLE members 
DROP CONSTRAINT IF EXISTS members_js_length;

ALTER TABLE members 
DROP CONSTRAINT IF EXISTS members_asf_length;

-- Drop existing constraints from coaches table
ALTER TABLE coaches 
DROP CONSTRAINT IF EXISTS coaches_js_length;

ALTER TABLE coaches 
DROP CONSTRAINT IF EXISTS coaches_asf_length;

-- Add new maximum length constraints to members table
ALTER TABLE members
ADD CONSTRAINT members_js_length
  CHECK (js_number IS NULL OR length(js_number) <= 7);

ALTER TABLE members
ADD CONSTRAINT members_asf_length
  CHECK (asf_licence_number IS NULL OR length(asf_licence_number) <= 7);

-- Add new maximum length constraints to coaches table
ALTER TABLE coaches
ADD CONSTRAINT coaches_js_length
  CHECK (js_number IS NULL OR length(js_number) <= 7);

ALTER TABLE coaches
ADD CONSTRAINT coaches_asf_length
  CHECK (asf_licence_number IS NULL OR length(asf_licence_number) <= 7);