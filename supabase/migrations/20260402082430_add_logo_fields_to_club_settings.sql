/*
  # Add logo and contact fields to club_settings

  1. Changes
    - Ensures club_settings table exists with all necessary fields
    - Adds club_phone, club_website, logo_url, logo_path columns
    - Adds club_street_number for separated address
  
  2. Security
    - Enables RLS on club_settings
    - Authenticated users can manage all club settings
*/

-- Create club_settings table if not exists
CREATE TABLE IF NOT EXISTS club_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_name TEXT,
  club_address TEXT,
  club_postal_code TEXT,
  club_city TEXT,
  club_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add new columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_settings' AND column_name = 'club_street_number'
  ) THEN
    ALTER TABLE club_settings ADD COLUMN club_street_number TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_settings' AND column_name = 'club_phone'
  ) THEN
    ALTER TABLE club_settings ADD COLUMN club_phone TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_settings' AND column_name = 'club_website'
  ) THEN
    ALTER TABLE club_settings ADD COLUMN club_website TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_settings' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE club_settings ADD COLUMN logo_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_settings' AND column_name = 'logo_path'
  ) THEN
    ALTER TABLE club_settings ADD COLUMN logo_path TEXT;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE club_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists
DROP POLICY IF EXISTS "Authenticated can manage club_settings" ON club_settings;

-- Create policy for authenticated users to manage settings
CREATE POLICY "Authenticated can manage club_settings"
ON club_settings FOR ALL TO authenticated
USING (true) WITH CHECK (true);