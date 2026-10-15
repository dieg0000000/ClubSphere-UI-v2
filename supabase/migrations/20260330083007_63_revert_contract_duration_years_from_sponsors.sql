/*
  # Revert contract_duration_years from sponsors table

  1. Changes
    - Remove `contract_duration_years` column from `sponsors` table
    - This field is not needed at the sponsor level
    - Contract durations should be managed in the sponsor_contracts table

  2. Notes
    - Safe to drop as this column was just added and contains no business-critical data
    - Reverting to keep sponsor-level data simple
*/

ALTER TABLE sponsors
DROP COLUMN IF EXISTS contract_duration_years;