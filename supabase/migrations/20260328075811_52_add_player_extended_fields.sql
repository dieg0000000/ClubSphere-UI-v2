/*
  # Add Extended Player Fields

  1. New Columns Added to `members` Table
    - `second_name` (TEXT) - Deuxième nom
    - `salutation` (TEXT) - Salutation
    - `address2` (TEXT) - Adresse supplémentaire
    - `country` (TEXT, default 'CH') - Pays
    - `email_pro` (TEXT) - Email entreprise
    - `phone_private` (TEXT) - Téléphone privé (fixe)
    - `football_nationality` (TEXT) - Nationalité football
    - `pseudonym` (TEXT) - Pseudonyme
    - `position` (TEXT with CHECK constraint) - Position de jeu (Gardien/Défenseur/Milieu/Attaquant/Autre)
    - `qualification_type` (TEXT) - Type de qualification (Transfert, Requalification, etc.)
    - `qualified_from` (DATE) - Qualifié dès le
    - `qualified_until` (DATE) - Qualifié à
    - `legal_rep1_relation` (TEXT) - Relation du représentant légal 1 (Père/Mère/Tuteur/Autre)
    - `legal_rep1_address` (TEXT) - Adresse du représentant légal 1
    - `legal_rep1_postal_code` (TEXT) - Code postal du représentant légal 1
    - `legal_rep1_city` (TEXT) - Ville du représentant légal 1
    - `legal_rep1_canton` (TEXT) - Canton du représentant légal 1
    - `legal_rep2_relation` (TEXT) - Relation du représentant légal 2
    - `legal_rep2_address` (TEXT) - Adresse du représentant légal 2
    - `legal_rep2_postal_code` (TEXT) - Code postal du représentant légal 2
    - `legal_rep2_city` (TEXT) - Ville du représentant légal 2
    - `legal_rep2_canton` (TEXT) - Canton du représentant légal 2

  2. Purpose
    - Align manual player creation form with CSV import fields
    - Support comprehensive player profiles with all ClubCorner fields
    - Enable proper legal representative address management
    - Track player qualification periods and types

  3. Notes
    - All new fields are optional (nullable) to maintain backward compatibility
    - Position field has CHECK constraint to enforce valid values
    - Country defaults to 'CH' (Switzerland)
    - Legal representative address fields allow separate addresses from player
*/

-- Add identity fields
ALTER TABLE members
ADD COLUMN IF NOT EXISTS second_name TEXT,
ADD COLUMN IF NOT EXISTS salutation TEXT,
ADD COLUMN IF NOT EXISTS pseudonym TEXT;

-- Add address fields
ALTER TABLE members
ADD COLUMN IF NOT EXISTS address2 TEXT,
ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'CH';

-- Add contact fields
ALTER TABLE members
ADD COLUMN IF NOT EXISTS email_pro TEXT,
ADD COLUMN IF NOT EXISTS phone_private TEXT;

-- Add football-specific fields
ALTER TABLE members
ADD COLUMN IF NOT EXISTS football_nationality TEXT;

-- Add position field with constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'position'
  ) THEN
    ALTER TABLE members
    ADD COLUMN position TEXT CHECK (
      position IN ('Gardien','Défenseur','Milieu','Attaquant','Autre')
    );
  END IF;
END $$;

-- Add qualification fields
ALTER TABLE members
ADD COLUMN IF NOT EXISTS qualification_type TEXT,
ADD COLUMN IF NOT EXISTS qualified_from DATE,
ADD COLUMN IF NOT EXISTS qualified_until DATE;

-- Add legal representative 1 extended fields
ALTER TABLE members
ADD COLUMN IF NOT EXISTS legal_rep1_relation TEXT,
ADD COLUMN IF NOT EXISTS legal_rep1_address TEXT,
ADD COLUMN IF NOT EXISTS legal_rep1_postal_code TEXT,
ADD COLUMN IF NOT EXISTS legal_rep1_city TEXT,
ADD COLUMN IF NOT EXISTS legal_rep1_canton TEXT;

-- Add legal representative 2 extended fields
ALTER TABLE members
ADD COLUMN IF NOT EXISTS legal_rep2_relation TEXT,
ADD COLUMN IF NOT EXISTS legal_rep2_address TEXT,
ADD COLUMN IF NOT EXISTS legal_rep2_postal_code TEXT,
ADD COLUMN IF NOT EXISTS legal_rep2_city TEXT,
ADD COLUMN IF NOT EXISTS legal_rep2_canton TEXT;
