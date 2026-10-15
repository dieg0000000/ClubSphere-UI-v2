/*
  # Fix meetings type and status constraints

  ## Problem
  The meetings table has two CHECK constraints that conflict with the application:
  1. `meetings_type_check`: only allows 'comite', 'ag', 'commission_technique' but the app stores display names from the meeting_types table
  2. `meetings_status_check`: only allows 'brouillon', 'finalise', 'approuve' but the code was inserting 'draft'

  ## Changes
  - Drop the type CHECK constraint so any string from meeting_types.name can be stored
  - Keep the status CHECK constraint (values are correct: brouillon/finalise/approuve)
  - The frontend code inserts 'draft' as status — this migration keeps the constraint but the code fix will use 'brouillon'
*/

ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_type_check;
