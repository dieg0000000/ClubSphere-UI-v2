/*
  # Add Training Periods to Teams

  1. Changes
    - Add `tour1_start` (DATE) - First training round start date (July-December)
    - Add `tour1_end` (DATE) - First training round end date
    - Add `tour2_start` (DATE) - Second training round start date (February-June)
    - Add `tour2_end` (DATE) - Second training round end date

  2. Notes
    - All columns are nullable as training periods may not be defined yet
    - Dates are stored as DATE type for day-level precision
    - No indexes needed as these are display-only fields
*/

ALTER TABLE teams
ADD COLUMN IF NOT EXISTS tour1_start DATE,
ADD COLUMN IF NOT EXISTS tour1_end DATE,
ADD COLUMN IF NOT EXISTS tour2_start DATE,
ADD COLUMN IF NOT EXISTS tour2_end DATE;
