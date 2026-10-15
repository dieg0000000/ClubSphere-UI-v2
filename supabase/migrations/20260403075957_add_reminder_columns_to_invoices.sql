/*
  # Add reminder tracking columns to invoices table

  1. Changes
    - Add `reminder1_sent_at` column to track when first reminder (R1) was sent
    - Add `reminder2_sent_at` column to track when second reminder (R2) was sent
    
  2. Details
    - Both columns are timestamptz (nullable)
    - Used to track reminder history and prevent duplicate sends
    - R1 should be sent when invoice is overdue by 30+ days
    - R2 should be sent when invoice is overdue by 60+ days and R1 was already sent
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'reminder1_sent_at'
  ) THEN
    ALTER TABLE invoices ADD COLUMN reminder1_sent_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'reminder2_sent_at'
  ) THEN
    ALTER TABLE invoices ADD COLUMN reminder2_sent_at timestamptz;
  END IF;
END $$;