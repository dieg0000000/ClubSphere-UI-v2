/*
  # Rename passport_number to asf_licence_number

  1. Changes
    - Rename `passport_number` column to `asf_licence_number` in `members` table
    - This field stores the Swiss Football Association (ASF) licence number
    - No data is lost during the rename operation

  2. Notes
    - ASF licence number is legitimate information for coaches to view
    - Only AVS numbers remain restricted from coach access
*/

ALTER TABLE members 
RENAME COLUMN passport_number TO asf_licence_number;