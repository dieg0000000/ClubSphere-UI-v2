/*
  # Add sent_at timestamp to invoices

  1. Changes
    - Add `sent_at` column to invoices table to track when invoice was sent
    - This is separate from `last_sent_at` which tracks the last time it was sent (for reminders)
  
  2. Notes
    - Uses TIMESTAMPTZ for proper timezone handling
    - Defaults to NULL for invoices that haven't been sent yet
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE invoices ADD COLUMN sent_at TIMESTAMPTZ;
  END IF;
END $$;
