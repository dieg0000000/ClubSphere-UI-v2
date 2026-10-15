/*
  # Create camt.054 Import Tracking System

  1. New Tables
    - `camt_imports`
      - `id` (uuid, primary key)
      - `filename` (text) - Name of imported camt.054 file(s)
      - `imported_at` (timestamptz) - Import timestamp
      - `imported_by` (uuid) - Reference to profiles table
      - `total_transactions` (integer) - Total transactions in file
      - `matched_count` (integer) - Successfully matched transactions
      - `unmatched_count` (integer) - Unmatched transactions
      - `status` (text) - Import status (completed/failed)

    - `camt_unmatched`
      - `id` (uuid, primary key)
      - `camt_import_id` (uuid) - Reference to camt_imports
      - `debtor_name` (text) - Payer name
      - `amount` (decimal) - Payment amount
      - `payment_date` (date) - Payment date
      - `qr_reference` (text) - QR reference if available
      - `additional_info` (text) - Additional payment info
      - `status` (text) - pending/matched_manually/ignored
      - `matched_invoice_id` (uuid) - Reference to invoices if matched
      - `notes` (text) - Admin notes
      - `created_at` (timestamptz) - Record creation timestamp

  2. Changes
    - Add `camt_import_id` column to `payments` table

  3. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage records
*/

-- Create camt_imports table
CREATE TABLE IF NOT EXISTS camt_imports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT now(),
  imported_by UUID REFERENCES profiles(id),
  total_transactions INTEGER DEFAULT 0,
  matched_count INTEGER DEFAULT 0,
  unmatched_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed'
);

ALTER TABLE camt_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage camt_imports"
  ON camt_imports FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create camt_unmatched table
CREATE TABLE IF NOT EXISTS camt_unmatched (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  camt_import_id UUID REFERENCES camt_imports(id),
  debtor_name TEXT,
  amount DECIMAL(10,2),
  payment_date DATE,
  qr_reference TEXT,
  additional_info TEXT,
  status TEXT DEFAULT 'pending',
  matched_invoice_id UUID REFERENCES invoices(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE camt_unmatched ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage camt_unmatched"
  ON camt_unmatched FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add camt_import_id to payments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'camt_import_id'
  ) THEN
    ALTER TABLE payments ADD COLUMN camt_import_id UUID REFERENCES camt_imports(id);
  END IF;
END $$;