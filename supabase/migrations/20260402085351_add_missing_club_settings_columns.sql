/*
  # Add missing columns to club_settings table

  1. Changes
    - Add `club_name` column to store club name
    - Add `club_address` column to store club street address
    - Add `club_street_number` column to store street number
    - Add `club_postal_code` column to store postal code
    - Add `club_city` column to store city
    - Add `club_email` column to store club email
    - Add `club_phone` column to store club phone number
    - Add `club_website` column to store club website URL
    - Add `logo_url` column to store logo public URL
    - Add `logo_path` column to store logo storage path
    - Add `updated_at` column to track last modification time
  
  2. Purpose
    - Enable full club settings management
    - Support club contact information storage
    - Track when settings are modified
*/

ALTER TABLE club_settings
ADD COLUMN IF NOT EXISTS club_name TEXT,
ADD COLUMN IF NOT EXISTS club_address TEXT,
ADD COLUMN IF NOT EXISTS club_street_number TEXT,
ADD COLUMN IF NOT EXISTS club_postal_code TEXT,
ADD COLUMN IF NOT EXISTS club_city TEXT,
ADD COLUMN IF NOT EXISTS club_email TEXT,
ADD COLUMN IF NOT EXISTS club_phone TEXT,
ADD COLUMN IF NOT EXISTS club_website TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS logo_path TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();