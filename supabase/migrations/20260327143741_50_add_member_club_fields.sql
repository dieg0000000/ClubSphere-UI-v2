/*
  # Add member club and affiliation fields

  1. Changes
    - Add `affiliation_date` (DATE) - Date when the member affiliated to the club
    - Add `club_origine` (TEXT) - The club where the member came from
    - Add `classe_de_jeu` (TEXT) - The playing class/level of the member
    - Add `remarques_club` (TEXT) - Club remarks imported from ClubCorner

  2. Notes
    - All fields are nullable to support existing records
    - These fields enhance member profile information for club management
*/

ALTER TABLE members
ADD COLUMN IF NOT EXISTS affiliation_date DATE,
ADD COLUMN IF NOT EXISTS club_origine TEXT,
ADD COLUMN IF NOT EXISTS classe_de_jeu TEXT,
ADD COLUMN IF NOT EXISTS remarques_club TEXT;
