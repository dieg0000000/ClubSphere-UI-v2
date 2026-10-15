/*
  # Add Sponsor Contract Management

  1. Changes to sponsors table
    - Add contract_start_date (date when current contract started)
    - Add contract_duration_years (duration of current contract)
    - Add non_renewal_reason (text explaining why contract wasn't renewed)
    - Add status (actif/non_renouvelé/expiré/en_négociation)

  2. New sponsor_contracts table
    - Stores complete history of all contracts per sponsor
    - Each renewal creates a new row
    - Links to sponsors table via sponsor_id
    - Stores contract PDFs in Supabase Storage

  3. Security
    - Enable RLS on sponsor_contracts
    - Authenticated users can read contracts
    - Only admins can manage contracts
*/

-- Add contract management columns to sponsors table
ALTER TABLE sponsors 
ADD COLUMN IF NOT EXISTS contract_start_date DATE,
ADD COLUMN IF NOT EXISTS contract_duration_years INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS non_renewal_reason TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'actif' 
  CHECK (status IN ('actif','non_renouvelé','expiré','en_négociation'));

-- Create sponsor_contracts table for contract history
CREATE TABLE IF NOT EXISTS sponsor_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id UUID REFERENCES sponsors(id) ON DELETE CASCADE,
  contract_number INT DEFAULT 1,
  start_date DATE NOT NULL,
  end_date DATE,
  duration_years INT,
  amount DECIMAL,
  contract_file_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on sponsor_contracts
ALTER TABLE sponsor_contracts ENABLE ROW LEVEL SECURITY;

-- RLS policies for sponsor_contracts
CREATE POLICY "Authenticated can read contracts"
  ON sponsor_contracts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert contracts"
  ON sponsor_contracts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update contracts"
  ON sponsor_contracts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete contracts"
  ON sponsor_contracts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );
