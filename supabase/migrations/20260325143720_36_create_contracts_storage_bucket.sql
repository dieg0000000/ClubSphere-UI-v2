/*
  # Create Contracts Storage Bucket

  1. New Storage Bucket
    - Create 'contracts' bucket for storing sponsor contract PDFs
    - Configure bucket to be private (authenticated access only)

  2. Security
    - Authenticated users can read contract files
    - Only admins can upload/update/delete contract files
*/

-- Create contracts bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read contracts
CREATE POLICY "Authenticated can view contracts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'contracts');

-- Allow admins to upload contracts
CREATE POLICY "Admins can upload contracts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'contracts' AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Allow admins to update contracts
CREATE POLICY "Admins can update contracts"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'contracts' AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'contracts' AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Allow admins to delete contracts
CREATE POLICY "Admins can delete contracts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'contracts' AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );
