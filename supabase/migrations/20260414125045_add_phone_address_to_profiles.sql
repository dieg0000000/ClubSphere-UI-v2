/*
  # Add phone and address fields to profiles table

  ## Purpose
  Allow admin/committee/president/vice_president users to store their contact
  information (phone, address, NPA, city) directly in their profile.

  ## Changes to profiles table
  - Add `phone` (text, nullable) — mobile phone number
  - Add `address` (text, nullable) — street address
  - Add `npa` (text, nullable) — postal code (NPA)
  - Add `city` (text, nullable) — city name
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'phone'
  ) THEN
    ALTER TABLE profiles ADD COLUMN phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'address'
  ) THEN
    ALTER TABLE profiles ADD COLUMN address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'npa'
  ) THEN
    ALTER TABLE profiles ADD COLUMN npa text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'city'
  ) THEN
    ALTER TABLE profiles ADD COLUMN city text;
  END IF;
END $$;
