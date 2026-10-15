/*
  # Add compte field to fee_configs

  ## Changes
  - `fee_configs` table: adds `compte` (text, nullable) column for accounting account reference per category
*/

ALTER TABLE fee_configs ADD COLUMN IF NOT EXISTS compte text;
