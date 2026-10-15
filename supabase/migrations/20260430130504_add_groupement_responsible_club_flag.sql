/*
  # Add responsible club flag to groupements

  1. Changes
    - Add `is_responsible_club` boolean default true on `groupements`
      - When true, our club (from club_settings) is the responsible club
      - When false, `managing_club_asf_number` indicates which partner is responsible
*/

ALTER TABLE groupements
  ADD COLUMN IF NOT EXISTS is_responsible_club boolean DEFAULT true;
