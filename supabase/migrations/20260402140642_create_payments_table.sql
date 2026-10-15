/*
  # Create payments table

  This migration creates a payments table to track payment transactions imported from camt.054 files.

  ## New Tables

  1. `payments`
     - `id` (uuid, primary key)
     - `invoice_id` (uuid, foreign key to invoices)
     - `amount` (numeric)
     - `payment_date` (date)
     - `qr_reference` (text, nullable)
     - `debtor_name` (text, nullable)
     - `import_batch` (text, nullable) - filename of imported camt.054
     - `matched_automatically` (boolean) - true if auto-matched
     - `created_at` (timestamptz)

  ## Security

  - Enable RLS on payments table
  - Add policy for authenticated users to view all payments
  - Add policy for authenticated users to insert payments
*/

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL,
  payment_date date NOT NULL,
  qr_reference text,
  debtor_name text,
  import_batch text,
  matched_automatically boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Policies for payments
CREATE POLICY "Authenticated users can view all payments"
  ON payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert payments"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add paid_date column to invoices if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'paid_date'
  ) THEN
    ALTER TABLE invoices ADD COLUMN paid_date date;
  END IF;
END $$;
