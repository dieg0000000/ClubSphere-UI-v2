/*
  # Add profile onboarding fields

  1. Changes
    - Add first_name column to profiles table
    - Add last_name column to profiles table
    - Add phone column to profiles table
    - Update existing profiles to split full_name into first_name and last_name
  
  2. Notes
    - avatar_url already exists
    - These fields are required for onboarding flow
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN first_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'last_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'phone'
  ) THEN
    ALTER TABLE profiles ADD COLUMN phone TEXT;
  END IF;
END $$;

UPDATE profiles 
SET 
  first_name = COALESCE(SPLIT_PART(full_name, ' ', 1), ''),
  last_name = COALESCE(NULLIF(SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1), ''), '')
WHERE first_name IS NULL OR last_name IS NULL;
