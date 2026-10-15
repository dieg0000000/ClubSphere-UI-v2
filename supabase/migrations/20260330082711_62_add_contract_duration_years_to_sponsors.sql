/*
  # Add contract_duration_years to sponsors table

  1. Changes
    - Add `contract_duration_years` column to `sponsors` table
      - Type: INT
      - Default: 1 (1 year contract)
      - Allows sponsors to specify contract duration directly
      - Used as fallback when no contracts exist in sponsor_contracts table

  2. Notes
    - This field provides a simple way to track contract duration at the sponsor level
    - The timeline will use this value when no formal contracts are recorded
    - Value of 0 means "indeterminate" duration
*/

ALTER TABLE sponsors
ADD COLUMN IF NOT EXISTS contract_duration_years INT DEFAULT 1;