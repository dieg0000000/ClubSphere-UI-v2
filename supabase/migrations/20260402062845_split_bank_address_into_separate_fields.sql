/*
  # Split Bank Address into Separate Fields

  1. Changes
    - Add `bank_street` column to store bank street name
    - Add `bank_street_number` column to store bank street number
    - Add `bank_postal_code` column to store bank postal code
    - Add `bank_city` column to store bank city name

  2. Notes
    - Old `bank_address` field will remain for backward compatibility
    - New fields allow better structured data entry
*/

ALTER TABLE finance_config
ADD COLUMN IF NOT EXISTS bank_street TEXT,
ADD COLUMN IF NOT EXISTS bank_street_number TEXT,
ADD COLUMN IF NOT EXISTS bank_postal_code TEXT,
ADD COLUMN IF NOT EXISTS bank_city TEXT;
